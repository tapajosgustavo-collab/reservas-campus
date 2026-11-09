import {
  esquemaAgenda,
  esquemaBuscarAgenda,
  esquemaBuscarRecursos,
  esquemaCadastrarRecurso,
  esquemaCriarIndisponibilidade,
  esquemaEditarRecurso,
  esquemaIdDoRecurso,
  esquemaIndisponibilidadeCriada,
  esquemaRecurso,
  esquemaRecursos,
} from '@reservas/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ErroApi, proibidoPelaRegra } from '../../../comum/erros';
import { limitesDaSemana, paraIsoSaoPaulo, segundaDaSemana } from '../../../comum/instante';
import { exigirPerfil, exigirSessao } from '../../../comum/sessao';
import type { Prisma } from '../../../generated/prisma/client';
import { agendaPara } from '../nucleo/agenda';
import { decidirIndisponibilidade } from '../nucleo/indisponibilidade';
import { decidirCadastro, decidirEdicao, type Efeito } from '../nucleo/recurso';
import { executar as executarEmReservas, violacoesDoIntervalo } from '../../reservas';
import { executar } from './efeitos';

const COLUNAS_DO_RESUMO = {
  id: true,
  tipo: true,
  nome: true,
  local: true,
  capacidade: true,
  patrimonio: true,
} as const;

const COLUNAS_DO_RECURSO = {
  ...COLUNAS_DO_RESUMO,
  gestor: { select: { id: true, nome: true } },
  horarios: {
    select: { diaSemana: true, abre: true, fecha: true },
    orderBy: { diaSemana: 'asc' },
  },
} as const;

function naoEncontrado(id: number) {
  return new ErroApi('nao_encontrado', `Recurso ${id} não encontrado.`);
}

async function buscarRecurso(request: FastifyRequest, id: number) {
  const recurso = await request.tx.recurso.findUnique({
    where: { id },
    select: COLUNAS_DO_RECURSO,
  });
  if (!recurso) throw naoEncontrado(id);
  return recurso;
}

/** Executa os efeitos de uma decisão aceita e devolve o id do Recurso. */
async function aplicar(request: FastifyRequest, efeitos: Efeito[]) {
  let recursoId = 0;
  for (const efeito of efeitos) {
    recursoId = await executar(request.tx, efeito);
    request.log.info({ evento: efeito.evento, recursoId }, efeito.evento);
  }
  return recursoId;
}

/** Instantes de uma Indisponibilidade na resposta, com o deslocamento de São Paulo. */
function indisponibilidadeEmSaoPaulo<T extends { inicio: Date; fim: Date | null }>(
  indisponibilidade: T,
) {
  return {
    ...indisponibilidade,
    inicio: paraIsoSaoPaulo(indisponibilidade.inicio),
    fim: indisponibilidade.fim && paraIsoSaoPaulo(indisponibilidade.fim),
  };
}

/**
 * Rotas do M2: cadastrar, editar, ver e "Meus recursos" (US04), a Indisponibilidade (US05), a
 * busca (US06) e a agenda (US07).
 */
export function registrarRotasDeRecursos(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.post(
    '/api/recursos',
    {
      schema: {
        summary: 'Cadastra um Espaço ou Equipamento; quem cadastra é o Gestor responsável',
        tags: ['recursos'],
        body: esquemaCadastrarRecurso,
        response: { 201: esquemaRecurso },
      },
    },
    async (request, reply) => {
      const quem = await exigirPerfil(request, 'Gestor');
      const { body } = request;
      if (body.tipo === 'Equipamento') {
        const outro = await request.tx.recurso.findUnique({
          where: { patrimonio: body.patrimonio },
          select: { id: true },
        });
        if (outro) {
          throw new ErroApi(
            'entrada_invalida',
            `Já existe um Equipamento com o patrimônio ${body.patrimonio}.`,
          );
        }
      }
      const recursoId = await aplicar(request, decidirCadastro(body, quem).efeitos);
      reply.status(201);
      return buscarRecurso(request, recursoId);
    },
  );

  rotas.patch(
    '/api/recursos/:id',
    {
      schema: {
        summary: 'Edita um Recurso (só o Gestor responsável); tipo e patrimônio não mudam',
        tags: ['recursos'],
        params: esquemaIdDoRecurso,
        body: esquemaEditarRecurso,
        response: { 200: esquemaRecurso },
      },
    },
    async (request) => {
      const quem = await exigirPerfil(request, 'Gestor');
      const { id } = request.params;
      const recurso = await request.tx.recurso.findUnique({
        where: { id },
        select: { id: true, tipo: true, gestorId: true },
      });
      if (!recurso) throw naoEncontrado(id);
      const decisao = decidirEdicao(recurso, request.body, quem);
      if (decisao.tipo === 'recusada') throw proibidoPelaRegra(decisao.violacoes);
      if (recurso.tipo === 'Equipamento' && request.body.capacidade !== undefined) {
        throw new ErroApi('entrada_invalida', 'Equipamento não tem Capacidade.');
      }
      if (recurso.tipo === 'Espaco' && request.body.local === null) {
        throw new ErroApi('entrada_invalida', 'Espaço precisa de local.');
      }
      await aplicar(request, decisao.efeitos);
      return buscarRecurso(request, recurso.id);
    },
  );

  rotas.post(
    '/api/recursos/:id/indisponibilidades',
    {
      schema: {
        summary:
          'Marca o Recurso como indisponível (só o Gestor responsável); as Reservas Pendentes e ' +
          'Confirmadas no período recebem Cancelamento pelo sistema, sem Penalidade (RN04)',
        tags: ['recursos'],
        params: esquemaIdDoRecurso,
        body: esquemaCriarIndisponibilidade,
        response: { 201: esquemaIndisponibilidadeCriada },
      },
    },
    async (request, reply) => {
      const quem = await exigirPerfil(request, 'Gestor');
      const { id } = request.params;
      const recurso = await request.tx.recurso.findUnique({
        where: { id },
        select: { id: true, gestorId: true },
      });
      if (!recurso) throw naoEncontrado(id);
      const pedido = {
        inicio: new Date(request.body.inicio),
        fim: request.body.fim === null ? null : new Date(request.body.fim),
        motivo: request.body.motivo,
      };
      // Todas as Reservas que tocam o período: quem escolhe as que são canceladas é o núcleo.
      const reservas = await request.tx.reserva.findMany({
        where: {
          recursoId: recurso.id,
          fim: { gt: pedido.inicio },
          ...(pedido.fim && { inicio: { lt: pedido.fim } }),
        },
        select: { id: true, inicio: true, fim: true, status: true },
      });
      const decisao = decidirIndisponibilidade({ recurso, reservas }, pedido, quem, request.agora);
      if (decisao.tipo === 'recusada') throw proibidoPelaRegra(decisao.violacoes);

      const [criada, ...cancelamentos] = decisao.efeitos;
      const indisponibilidadeId = await executar(request.tx, criada);
      request.log.info({ evento: criada.evento, indisponibilidadeId }, criada.evento);
      // Só o M3 grava em `reserva` e `transicao`.
      for (const cancelamento of cancelamentos) {
        await executarEmReservas(request.tx, cancelamento);
        request.log.info(
          { evento: cancelamento.evento, reservaId: cancelamento.reservaId },
          cancelamento.evento,
        );
      }
      const indisponibilidade = await request.tx.indisponibilidade.findUniqueOrThrow({
        where: { id: indisponibilidadeId },
      });
      reply.status(201);
      return {
        indisponibilidade: {
          ...indisponibilidadeEmSaoPaulo(indisponibilidade),
          criadaEm: paraIsoSaoPaulo(indisponibilidade.criadaEm),
        },
        reservasCanceladas: cancelamentos.length,
      };
    },
  );

  rotas.get(
    '/api/recursos/:id',
    {
      schema: {
        summary: 'Mostra um Recurso com o Horário de funcionamento e o Gestor responsável',
        tags: ['recursos'],
        params: esquemaIdDoRecurso,
        response: { 200: esquemaRecurso },
      },
    },
    async (request) => {
      await exigirSessao(request);
      return buscarRecurso(request, request.params.id);
    },
  );

  rotas.get(
    '/api/recursos',
    {
      schema: {
        summary:
          'Busca Recursos por tipo, Capacidade e texto; com inicio e fim, só os livres (US06). ' +
          'Com gestor=eu, só os do Gestor da sessão ("Meus recursos")',
        tags: ['recursos'],
        querystring: esquemaBuscarRecursos,
        response: { 200: esquemaRecursos },
      },
    },
    async (request) => {
      const quem = await exigirSessao(request);
      const { gestor, tipo, capacidadeMin, q, inicio, fim } = request.query;
      // O `contains` vira ILIKE sem escapar: `%`, `_` e `\` digitados são texto, não curinga.
      const texto = q?.trim().replace(/[\\%_]/g, '\\$&');
      const where: Prisma.RecursoWhereInput = {
        ...(gestor === 'eu' && { gestorId: quem.id }),
        ...(tipo && { tipo }),
        // Equipamento não tem Capacidade: com o filtro, só Espaços.
        ...(capacidadeMin !== undefined && { capacidade: { gte: capacidadeMin } }),
        ...(texto && {
          OR: [
            { nome: { contains: texto, mode: 'insensitive' } },
            { local: { contains: texto, mode: 'insensitive' } },
          ],
        }),
      };
      const orderBy: Prisma.RecursoOrderByWithRelationInput[] = [{ nome: 'asc' }, { id: 'asc' }];
      if (inicio === undefined || fim === undefined) {
        return request.tx.recurso.findMany({ where, select: COLUNAS_DO_RESUMO, orderBy });
      }

      const intervalo = { inicio: new Date(inicio), fim: new Date(fim) };
      const candidatos = await request.tx.recurso.findMany({
        where,
        orderBy,
        select: {
          ...COLUNAS_DO_RESUMO,
          horarios: { select: { diaSemana: true, abre: true, fecha: true } },
          // Todas as Reservas que tocam o Intervalo: quem escolhe as ativas é o núcleo.
          reservas: {
            where: { inicio: { lt: intervalo.fim }, fim: { gt: intervalo.inicio } },
            select: { inicio: true, fim: true, status: true },
          },
        },
      });
      // Livre é o que o reservar aceitaria pelas RN01–RN03: a regra é a do M3, não uma cópia.
      // Só o resumo sai: nada das Reservas de outras pessoas (RN22).
      return candidatos
        .filter(
          ({ horarios, reservas }) =>
            violacoesDoIntervalo(intervalo, { horarios, reservasDoRecurso: reservas }).length === 0,
        )
        .map(({ id, tipo, nome, local, capacidade, patrimonio }) => ({
          id,
          tipo,
          nome,
          local,
          capacidade,
          patrimonio,
        }));
    },
  );
  rotas.get(
    '/api/recursos/:id/agenda',
    {
      schema: {
        summary: 'Agenda da semana do Recurso; de quem não é o dono, só o Intervalo (RN22)',
        tags: ['recursos'],
        params: esquemaIdDoRecurso,
        querystring: esquemaBuscarAgenda,
        response: { 200: esquemaAgenda },
      },
    },
    async (request) => {
      const quem = await exigirSessao(request);
      const recurso = await buscarRecurso(request, request.params.id);
      const semana = request.query.semana ?? segundaDaSemana(request.agora);
      const { inicio, fim } = limitesDaSemana(semana);
      // Todas as Reservas que tocam a semana: quem escolhe as ativas é o núcleo.
      const reservas = await request.tx.reserva.findMany({
        where: { recursoId: recurso.id, inicio: { lt: fim }, fim: { gt: inicio } },
        select: { id: true, usuarioId: true, inicio: true, fim: true, status: true },
        orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
      });
      // As Indisponibilidades que tocam a semana, inclusive as sem fim que começaram antes.
      const indisponibilidades = await request.tx.indisponibilidade.findMany({
        where: {
          recursoId: recurso.id,
          inicio: { lt: fim },
          OR: [{ fim: null }, { fim: { gt: inicio } }],
        },
        select: { inicio: true, fim: true, motivo: true },
        orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
      });
      const agenda = agendaPara(quem, {
        agora: request.agora,
        recurso,
        indisponibilidades,
        reservas,
      });
      return {
        ...agenda,
        agora: paraIsoSaoPaulo(agenda.agora),
        semana,
        indisponibilidades: agenda.indisponibilidades.map(indisponibilidadeEmSaoPaulo),
        ocupacoes: agenda.ocupacoes.map((ocupacao) => ({
          ...ocupacao,
          inicio: paraIsoSaoPaulo(ocupacao.inicio),
          fim: paraIsoSaoPaulo(ocupacao.fim),
        })),
      };
    },
  );
}
