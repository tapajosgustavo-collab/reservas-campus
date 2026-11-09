import {
  esquemaBuscarReservas,
  esquemaCriarReserva,
  esquemaDetalheDaReserva,
  esquemaIdDaReserva,
  esquemaPaginaDeReservas,
  esquemaReserva,
  POLITICA,
  RESERVAS_POR_PAGINA,
  STATUS_ATIVOS,
} from '@reservas/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ErroApi, proibidoPelaRegra, regraViolada } from '../../../comum/erros';
import { paraIsoSaoPaulo } from '../../../comum/instante';
import { exigirPerfil, exigirSessao } from '../../../comum/sessao';
import { violacoesDoDetalhe } from '../nucleo/detalhe';
import { decidirReserva } from '../nucleo/reservar';
import { executar } from './efeitos';

const COLUNAS_DO_ITEM = {
  id: true,
  recursoId: true,
  serieId: true,
  inicio: true,
  fim: true,
  participantes: true,
  finalidade: true,
  status: true,
  criadaEm: true,
  recurso: { select: { id: true, nome: true, tipo: true } },
} as const;

/** Os instantes da Reserva em ISO com o deslocamento de São Paulo. */
function comInstantes<T extends { inicio: Date; fim: Date; criadaEm: Date }>(reserva: T) {
  return {
    ...reserva,
    inicio: paraIsoSaoPaulo(reserva.inicio),
    fim: paraIsoSaoPaulo(reserva.fim),
    criadaEm: paraIsoSaoPaulo(reserva.criadaEm),
  };
}

/** Rotas do M3 do incremento 1: reservar (US08) e Minhas reservas (US10). */
export function registrarRotasDeReservas(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.post(
    '/api/reservas',
    {
      schema: {
        summary: 'Reserva um Recurso num Intervalo; recusa com todas as RNs violadas',
        tags: ['reservas'],
        body: esquemaCriarReserva,
        response: { 201: esquemaReserva },
      },
    },
    async (request, reply) => {
      const quem = await exigirPerfil(request, 'Aluno', 'Docente');
      const { body, tx, agora } = request;
      const recurso = await tx.recurso.findUnique({
        where: { id: body.recursoId },
        select: {
          tipo: true,
          capacidade: true,
          restrito: true,
          horarios: { select: { diaSemana: true, abre: true, fecha: true } },
        },
      });
      if (!recurso) {
        throw new ErroApi('nao_encontrado', `Recurso ${body.recursoId} não encontrado.`);
      }
      if (recurso.tipo === 'Equipamento' && body.participantes !== undefined) {
        throw new ErroApi('entrada_invalida', 'Equipamento não tem Participantes.');
      }

      const pedido = { ...body, inicio: new Date(body.inicio), fim: new Date(body.fim) };
      // Todas as Reservas em volta do Intervalo: quem escolhe as ativas é o núcleo.
      const reservasDoRecurso = await tx.reserva.findMany({
        where: {
          recursoId: body.recursoId,
          inicio: { lt: pedido.fim },
          fim: { gt: pedido.inicio },
        },
        select: { inicio: true, fim: true, status: true },
        orderBy: { inicio: 'asc' },
      });
      // Só as ativas de quem reserva: com o advisory lock da requisição, duas ao mesmo tempo não
      // leem a mesma Cota (RNF11, ADR 0001).
      const ativasDoUsuario = await tx.reserva.findMany({
        where: { usuarioId: quem.id, status: { in: [...STATUS_ATIVOS] } },
        select: { id: true, serieId: true },
      });
      const decisao = decidirReserva(
        {
          horarios: recurso.horarios,
          reservasDoRecurso,
          recurso: {
            tipo: recurso.tipo,
            capacidade: recurso.capacidade,
            restrito: recurso.restrito,
          },
          ativasDoUsuario,
          politica: POLITICA,
        },
        pedido,
        quem,
        agora,
      );
      if (decisao.tipo === 'recusada') throw regraViolada(decisao.violacoes);

      const [efeito] = decisao.efeitos;
      const reserva = await executar(tx, efeito);
      request.log.info({ evento: efeito.evento, reservaId: reserva.id }, efeito.evento);
      reply.status(201);
      return comInstantes(reserva);
    },
  );

  rotas.get(
    '/api/reservas',
    {
      schema: {
        summary: 'Minhas reservas: Ativas por início crescente, Encerradas decrescente',
        tags: ['reservas'],
        querystring: esquemaBuscarReservas,
        response: { 200: esquemaPaginaDeReservas },
      },
    },
    async (request) => {
      const quem = await exigirPerfil(request, 'Aluno', 'Docente');
      const { situacao, pagina } = request.query;
      const ativas = situacao === 'ativas';
      const where = {
        usuarioId: quem.id,
        status: ativas ? { in: [...STATUS_ATIVOS] } : { notIn: [...STATUS_ATIVOS] },
      };
      const ordem = ativas ? 'asc' : 'desc';
      const [total, reservas] = await Promise.all([
        request.tx.reserva.count({ where }),
        request.tx.reserva.findMany({
          where,
          select: COLUNAS_DO_ITEM,
          orderBy: [{ inicio: ordem }, { id: ordem }],
          skip: (pagina - 1) * RESERVAS_POR_PAGINA,
          take: RESERVAS_POR_PAGINA,
        }),
      ]);
      return {
        itens: reservas.map(comInstantes),
        total,
        pagina,
        porPagina: RESERVAS_POR_PAGINA,
      };
    },
  );

  rotas.get(
    '/api/reservas/:id',
    {
      schema: {
        summary: 'Detalhe da Reserva com o histórico; só o dono e o Gestor responsável (RN22)',
        tags: ['reservas'],
        params: esquemaIdDaReserva,
        response: { 200: esquemaDetalheDaReserva },
      },
    },
    async (request) => {
      const quem = await exigirSessao(request);
      const { id } = request.params;
      const reserva = await request.tx.reserva.findUnique({
        where: { id },
        select: {
          ...COLUNAS_DO_ITEM,
          usuarioId: true,
          usuario: { select: { id: true, nome: true } },
          recurso: { select: { id: true, nome: true, tipo: true, gestorId: true } },
          transicoes: {
            select: {
              de: true,
              para: true,
              em: true,
              observacao: true,
              por: { select: { id: true, nome: true } },
            },
            orderBy: [{ em: 'asc' }, { id: 'asc' }],
          },
        },
      });
      if (!reserva) throw new ErroApi('nao_encontrado', `Reserva ${id} não encontrada.`);
      const violacoes = violacoesDoDetalhe(
        { usuarioId: reserva.usuarioId, gestorId: reserva.recurso.gestorId },
        quem,
      );
      if (violacoes.length > 0) throw proibidoPelaRegra(violacoes);

      return {
        ...comInstantes(reserva),
        historico: reserva.transicoes.map(({ em, ...transicao }) => ({
          ...transicao,
          em: paraIsoSaoPaulo(em),
        })),
      };
    },
  );
}
