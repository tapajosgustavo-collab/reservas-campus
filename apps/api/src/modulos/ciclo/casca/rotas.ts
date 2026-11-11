import {
  esquemaBuscarNotificacoes,
  esquemaCancelamento,
  esquemaDevolucao,
  esquemaEmUso,
  esquemaFila,
  esquemaIdDaNotificacao,
  esquemaIdDaReserva,
  esquemaPaginaDeNotificacoes,
  esquemaRecusa,
  esquemaReserva,
  NOTIFICACOES_POR_PAGINA,
  POLITICA,
} from '@reservas/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Transacao } from '../../../comum/banco';
import { ErroApi, proibidoPelaRegra, regraViolada } from '../../../comum/erros';
import { paraIsoSaoPaulo } from '../../../comum/instante';
import { exigirPerfil, exigirSessao } from '../../../comum/sessao';
import { executar as executarEmReservas } from '../../reservas';
import { decidirCancelamento } from '../nucleo/cancelamento';
import { decidirCheckIn } from '../nucleo/check-in';
import { decidirDevolucao, devolucaoAtrasada } from '../nucleo/devolucao';
import {
  decidirAprovacao,
  decidirRecusa,
  prazoDeDecisao,
  type Decisao as DecisaoDoPedido,
  type FatosDoPedido,
} from '../nucleo/pedido';
import { executar } from './efeitos';

/** Os instantes da Reserva em ISO com o deslocamento de São Paulo. */
function paraResposta<T extends { inicio: Date; fim: Date; criadaEm: Date }>(reserva: T) {
  return {
    ...reserva,
    inicio: paraIsoSaoPaulo(reserva.inicio),
    fim: paraIsoSaoPaulo(reserva.fim),
    criadaEm: paraIsoSaoPaulo(reserva.criadaEm),
  };
}

/** Os fatos da Aprovação e da Recusa (US11): o Pedido, o Gestor do Recurso dele e a Política. */
async function fatosDoPedido(tx: Transacao, id: number): Promise<FatosDoPedido> {
  const reserva = await tx.reserva.findUnique({
    where: { id },
    select: {
      id: true,
      usuarioId: true,
      status: true,
      inicio: true,
      fim: true,
      recurso: { select: { nome: true, gestorId: true } },
    },
  });
  if (!reserva) throw new ErroApi('nao_encontrado', `Reserva ${id} não encontrada.`);
  return { reserva, politica: POLITICA };
}

/** Responde 403 ou 422 pela decisão recusada, ou grava a mudança de Status (M3) e a Notificação (M4). */
async function executarDecisao(request: FastifyRequest, decisao: DecisaoDoPedido) {
  if (decisao.tipo === 'proibida') throw proibidoPelaRegra(decisao.violacoes);
  if (decisao.tipo === 'recusada') throw regraViolada(decisao.violacoes);
  const [mudanca, emitida] = decisao.efeitos;
  const reserva = await executarEmReservas(request.tx, mudanca);
  request.log.info({ evento: mudanca.evento, reservaId: reserva.id }, mudanca.evento);
  const notificacao = await executar(request.tx, emitida);
  request.log.info(
    {
      evento: emitida.evento,
      notificacaoId: notificacao.id,
      destinatarioId: notificacao.destinatarioId,
      reservaId: notificacao.reservaId,
    },
    emitida.evento,
  );
  return reserva;
}

/** Rotas do M4: a fila do Gestor (US11), o Check-in (US12), o Cancelamento (US13) e a Devolução (US14). */
export function registrarRotasDoCiclo(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.post(
    '/api/reservas/:id/check-in',
    {
      schema: {
        summary: 'Check-in: o dono chegou ao Espaço ou retirou o Equipamento (RN14)',
        tags: ['ciclo'],
        params: esquemaIdDaReserva,
        response: { 200: esquemaReserva },
      },
    },
    async (request) => {
      // Quem pode é o dono, e essa regra tem id (RN14): fica no núcleo, não no Perfil da rota.
      const quem = await exigirSessao(request);
      const { params, tx, agora } = request;
      const reserva = await tx.reserva.findUnique({
        where: { id: params.id },
        select: { id: true, usuarioId: true, inicio: true, status: true },
      });
      if (!reserva) throw new ErroApi('nao_encontrado', `Reserva ${params.id} não encontrada.`);

      const decisao = decidirCheckIn({ reserva, politica: POLITICA }, quem, agora);
      if (decisao.tipo === 'proibida') throw proibidoPelaRegra(decisao.violacoes);
      if (decisao.tipo === 'recusada') throw regraViolada(decisao.violacoes);

      // O Status da Reserva é do M3: o M4 decide e pede a ele que grave (spec §2).
      const [efeito] = decisao.efeitos;
      const emUso = await executarEmReservas(tx, efeito);
      request.log.info({ evento: efeito.evento, reservaId: emUso.id }, efeito.evento);
      return paraResposta(emUso);
    },
  );

  rotas.post(
    '/api/reservas/:id/cancelamento',
    {
      schema: {
        summary: 'Cancela a própria Reserva Pendente ou Confirmada até o início (RN16)',
        tags: ['ciclo'],
        params: esquemaIdDaReserva,
        response: { 200: esquemaCancelamento },
      },
    },
    async (request) => {
      // Quem pode é o dono, e essa regra tem id (RN16): fica no núcleo, não no Perfil da rota.
      const quem = await exigirSessao(request);
      const { params, tx, agora } = request;
      const reserva = await tx.reserva.findUnique({
        where: { id: params.id },
        select: { id: true, usuarioId: true, inicio: true, status: true },
      });
      if (!reserva) throw new ErroApi('nao_encontrado', `Reserva ${params.id} não encontrada.`);

      const decisao = decidirCancelamento({ reserva }, quem, agora);
      if (decisao.tipo === 'proibida') throw proibidoPelaRegra(decisao.violacoes);
      if (decisao.tipo === 'recusada') throw regraViolada(decisao.violacoes);

      // O Status da Reserva é do M3: o M4 decide e pede a ele que grave (spec §2).
      const [efeito] = decisao.efeitos;
      const cancelada = await executarEmReservas(tx, efeito);
      request.log.info({ evento: efeito.evento, reservaId: cancelada.id }, efeito.evento);
      return {
        reserva: paraResposta(cancelada),
        penalidade: null,
      };
    },
  );

  rotas.get(
    '/api/gestao/pedidos',
    {
      schema: {
        summary: 'Fila dos Pedidos Pendentes dos Recursos do Gestor, pelo início (US11)',
        tags: ['ciclo'],
        response: { 200: esquemaFila },
      },
    },
    async (request) => {
      const quem = await exigirPerfil(request, 'Gestor');
      const pedidos = await request.tx.reserva.findMany({
        where: { status: 'Pendente', recurso: { gestorId: quem.id } },
        select: {
          id: true,
          inicio: true,
          fim: true,
          participantes: true,
          finalidade: true,
          recurso: { select: { id: true, nome: true, tipo: true, capacidade: true } },
          usuario: { select: { id: true, nome: true, perfil: true } },
        },
        orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
      });
      return pedidos.map(({ inicio, fim, usuario, ...pedido }) => ({
        ...pedido,
        inicio: paraIsoSaoPaulo(inicio),
        fim: paraIsoSaoPaulo(fim),
        expiraEm: paraIsoSaoPaulo(prazoDeDecisao(inicio, POLITICA)),
        solicitante: usuario,
      }));
    },
  );

  rotas.post(
    '/api/reservas/:id/aprovacao',
    {
      schema: {
        summary: 'Aprova o Pedido Pendente pelo Gestor responsável (US11, RN12, RN13)',
        tags: ['ciclo'],
        params: esquemaIdDaReserva,
        response: { 200: esquemaReserva },
      },
    },
    async (request) => {
      const quem = await exigirPerfil(request, 'Gestor');
      const fatos = await fatosDoPedido(request.tx, request.params.id);
      const decisao = decidirAprovacao(fatos, quem, request.agora);
      return paraResposta(await executarDecisao(request, decisao));
    },
  );

  rotas.post(
    '/api/reservas/:id/recusa',
    {
      schema: {
        summary: 'Recusa o Pedido Pendente com justificativa (US11, RN11, RN12, RN13)',
        tags: ['ciclo'],
        params: esquemaIdDaReserva,
        body: esquemaRecusa,
        response: { 200: esquemaReserva },
      },
    },
    async (request) => {
      const quem = await exigirPerfil(request, 'Gestor');
      const fatos = await fatosDoPedido(request.tx, request.params.id);
      const decisao = decidirRecusa(fatos, request.body, quem, request.agora);
      return paraResposta(await executarDecisao(request, decisao));
    },
  );

  rotas.get(
    '/api/gestao/em-uso',
    {
      schema: {
        summary:
          'Reservas Em uso dos Equipamentos do Gestor, por fim, com Devolução atrasada (US14)',
        tags: ['ciclo'],
        response: { 200: esquemaEmUso },
      },
    },
    async (request) => {
      const quem = await exigirPerfil(request, 'Gestor');
      const { tx, agora } = request;
      const reservas = await tx.reserva.findMany({
        where: {
          status: 'EmUso',
          recurso: { tipo: 'Equipamento', gestorId: quem.id },
        },
        select: {
          id: true,
          inicio: true,
          fim: true,
          recurso: { select: { id: true, nome: true, patrimonio: true } },
          usuario: { select: { id: true, nome: true } },
        },
        orderBy: [{ fim: 'asc' }, { id: 'asc' }],
      });
      return reservas.map(({ inicio, fim, recurso, ...reserva }) => ({
        ...reserva,
        inicio: paraIsoSaoPaulo(inicio),
        fim: paraIsoSaoPaulo(fim),
        devolucaoAtrasada: devolucaoAtrasada(fim, POLITICA, agora),
        recurso: { ...recurso, patrimonio: recurso.patrimonio! },
      }));
    },
  );

  rotas.post(
    '/api/reservas/:id/devolucao',
    {
      schema: {
        summary: 'Registra a Devolução do Equipamento pelo Gestor responsável (US14, RN13, RN17)',
        tags: ['ciclo'],
        params: esquemaIdDaReserva,
        body: esquemaDevolucao,
        response: { 200: esquemaReserva },
      },
    },
    async (request) => {
      const quem = await exigirPerfil(request, 'Gestor');
      const { params, body, tx, agora } = request;
      const reserva = await tx.reserva.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          status: true,
          recurso: { select: { tipo: true, gestorId: true } },
        },
      });
      if (!reserva) throw new ErroApi('nao_encontrado', `Reserva ${params.id} não encontrada.`);

      const decisao = decidirDevolucao({ reserva }, body, quem, agora);
      if (decisao.tipo === 'proibida') throw proibidoPelaRegra(decisao.violacoes);
      if (decisao.tipo === 'recusada') throw regraViolada(decisao.violacoes);

      const [efeito] = decisao.efeitos;
      const concluida = await executarEmReservas(tx, efeito);
      request.log.info({ evento: efeito.evento, reservaId: concluida.id }, efeito.evento);
      return paraResposta(concluida);
    },
  );

  rotas.get(
    '/api/notificacoes',
    {
      schema: {
        summary: 'Notificações do Usuário da sessão, mais novas primeiro, 20 por página (US16)',
        tags: ['ciclo'],
        querystring: esquemaBuscarNotificacoes,
        response: { 200: esquemaPaginaDeNotificacoes },
      },
    },
    async (request) => {
      const quem = await exigirSessao(request);
      const { pagina } = request.query;
      const { tx } = request;
      const where = { destinatarioId: quem.id };
      const [itens, total, naoLidas] = await Promise.all([
        tx.notificacao.findMany({
          where,
          select: {
            id: true,
            tipo: true,
            mensagem: true,
            em: true,
            lidaEm: true,
            reservaId: true,
          },
          orderBy: [{ em: 'desc' }, { id: 'desc' }],
          skip: (pagina - 1) * NOTIFICACOES_POR_PAGINA,
          take: NOTIFICACOES_POR_PAGINA,
        }),
        tx.notificacao.count({ where }),
        tx.notificacao.count({ where: { destinatarioId: quem.id, lidaEm: null } }),
      ]);
      return {
        itens: itens.map(({ em, lidaEm, ...item }) => ({
          ...item,
          em: paraIsoSaoPaulo(em),
          lidaEm: lidaEm ? paraIsoSaoPaulo(lidaEm) : null,
        })),
        total,
        naoLidas,
      };
    },
  );

  rotas.post(
    '/api/notificacoes/:id/leitura',
    {
      schema: {
        summary: 'Marca uma Notificação do Usuário como lida (US16)',
        tags: ['ciclo'],
        params: esquemaIdDaNotificacao,
        response: { 204: z.null().describe('Notificação marcada como lida') },
      },
    },
    async (request, reply) => {
      const quem = await exigirSessao(request);
      const { params, tx, agora } = request;
      const notificacao = await tx.notificacao.findUnique({
        where: { id: params.id },
        select: { id: true, destinatarioId: true, lidaEm: true },
      });
      if (!notificacao) {
        throw new ErroApi('nao_encontrado', `Notificação ${params.id} não encontrada.`);
      }
      if (notificacao.destinatarioId !== quem.id) {
        throw new ErroApi('proibido', 'Esta Notificação pertence a outro Usuário.');
      }
      if (notificacao.lidaEm === null) {
        await tx.notificacao.update({
          where: { id: notificacao.id },
          data: { lidaEm: agora },
        });
      }
      reply.status(204);
      return null;
    },
  );

  rotas.post(
    '/api/notificacoes/leitura',
    {
      schema: {
        summary: 'Marca todas as Notificações não lidas do Usuário como lidas (US16)',
        tags: ['ciclo'],
        response: { 204: z.null().describe('Notificações marcadas como lidas') },
      },
    },
    async (request, reply) => {
      const quem = await exigirSessao(request);
      await request.tx.notificacao.updateMany({
        where: { destinatarioId: quem.id, lidaEm: null },
        data: { lidaEm: request.agora },
      });
      reply.status(204);
      return null;
    },
  );
}
