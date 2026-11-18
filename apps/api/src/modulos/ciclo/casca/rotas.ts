import {
  esquemaBuscarNotificacoes,
  esquemaCancelamento,
  esquemaDevolucao,
  esquemaEmUso,
  esquemaFila,
  esquemaIdDaNotificacao,
  esquemaIdDaReserva,
  esquemaIdDaSerie,
  esquemaPaginaDeNotificacoes,
  esquemaRecusa,
  esquemaReserva,
  esquemaSerieDecidida,
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
  decidirAprovacaoDaSerie,
  decidirRecusa,
  decidirRecusaDaSerie,
  filaDoGestor,
  type Decisao as DecisaoDoPedido,
  type DecisaoDaSerie,
  type FatosDaSerie,
  type FatosDoPedido,
  type NotificacaoEmitida,
} from '../nucleo/pedido';
import { executar, registrarPenalidadeEAvisar } from './efeitos';

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
      serieId: true,
      status: true,
      inicio: true,
      fim: true,
      recurso: { select: { nome: true, gestorId: true } },
    },
  });
  if (!reserva) throw new ErroApi('nao_encontrado', `Reserva ${id} não encontrada.`);
  return { reserva, politica: POLITICA };
}

/** Os fatos da Série decidida inteira (US11, RN21): todas as Ocorrências e o Gestor do Recurso. */
async function fatosDaSerie(tx: Transacao, id: number): Promise<FatosDaSerie> {
  const serie = await tx.serie.findUnique({
    where: { id },
    select: {
      id: true,
      usuarioId: true,
      recurso: { select: { nome: true, gestorId: true } },
      reservas: { select: { id: true, status: true, inicio: true, fim: true } },
    },
  });
  if (!serie) throw new ErroApi('nao_encontrado', `Série ${id} não encontrada.`);
  const { reservas: ocorrencias, ...resto } = serie;
  return { serie: { ...resto, ocorrencias }, politica: POLITICA };
}

/** Responde 403 ou 422 pela decisão recusada, ou grava a mudança de Status (M3) e a Notificação (M4). */
async function executarDecisao(request: FastifyRequest, decisao: DecisaoDoPedido) {
  if (decisao.tipo === 'proibida') throw proibidoPelaRegra(decisao.violacoes);
  if (decisao.tipo === 'recusada') throw regraViolada(decisao.violacoes);
  const [mudanca, emitida] = decisao.efeitos;
  const reserva = await executarEmReservas(request.tx, mudanca);
  request.log.info({ evento: mudanca.evento, reservaId: reserva.id }, mudanca.evento);
  await emitir(request, emitida);
  return reserva;
}

/** Como o `executarDecisao`, para a Série decidida inteira: grava o lote (M3) e uma Notificação só. */
async function executarDecisaoDaSerie(request: FastifyRequest, decisao: DecisaoDaSerie) {
  if (decisao.tipo === 'proibida') throw proibidoPelaRegra(decisao.violacoes);
  if (decisao.tipo === 'recusada') throw regraViolada(decisao.violacoes);
  const [mudanca, emitida] = decisao.efeitos;
  const reservas = await executarEmReservas(request.tx, mudanca);
  request.log.info({ evento: mudanca.evento, reservaIds: mudanca.reservaIds }, mudanca.evento);
  await emitir(request, emitida);
  return reservas;
}

/** Grava a Notificação de decisão (M4) e registra no log. */
async function emitir(request: FastifyRequest, emitida: NotificacaoEmitida) {
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
}

/** Rotas do M4: a fila do Gestor (US11), o Check-in (US12), o Cancelamento (US13) e a Devolução (US14). */
export function registrarRotasDoCiclo(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.post(
    '/api/reservas/:id/check-in',
    {
      schema: {
        summary:
          'Check-in: o dono chegou ao Espaço ou retirou o Equipamento; recusado com o Equipamento ainda fora (RN14, RN23)',
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
        select: {
          id: true,
          usuarioId: true,
          inicio: true,
          status: true,
          recurso: { select: { id: true, tipo: true } },
        },
      });
      if (!reserva) throw new ErroApi('nao_encontrado', `Reserva ${params.id} não encontrada.`);

      // RN23: quem decide se a anterior ainda está fora é o núcleo; a casca só carrega as Em uso.
      const emUsoDoRecurso = await tx.reserva.findMany({
        where: { recursoId: reserva.recurso.id, status: 'EmUso' },
        select: {
          id: true,
          inicio: true,
          status: true,
          recurso: { select: { id: true, tipo: true } },
        },
      });

      const decisao = decidirCheckIn({ reserva, politica: POLITICA, emUsoDoRecurso }, quem, agora);
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
        summary:
          'Cancela a própria Reserva Pendente ou Confirmada até o início; a Confirmada a menos de ' +
          '2h do início gera Penalidade por Cancelamento tardio (RN16)',
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
        select: {
          id: true,
          usuarioId: true,
          inicio: true,
          fim: true,
          status: true,
          recurso: { select: { nome: true } },
        },
      });
      if (!reserva) throw new ErroApi('nao_encontrado', `Reserva ${params.id} não encontrada.`);

      const decisao = decidirCancelamento({ reserva, politica: POLITICA }, quem, agora);
      if (decisao.tipo === 'proibida') throw proibidoPelaRegra(decisao.violacoes);
      if (decisao.tipo === 'recusada') throw regraViolada(decisao.violacoes);

      // O Status da Reserva é do M3: o M4 decide e pede a ele que grave (spec §2).
      const [efeito] = decisao.efeitos;
      const cancelada = await executarEmReservas(tx, efeito);
      request.log.info({ evento: efeito.evento, reservaId: cancelada.id }, efeito.evento);
      if (decisao.efeitos.length === 1) {
        return { reserva: paraResposta(cancelada), penalidade: null };
      }

      // RN16: a Penalidade é do M1, que grava; a Notificação é do M4. O aviso da Penalidade vai
      // antes, para o da Suspensão que ela pode iniciar (RN19) ficar por cima na lista.
      const [, penalidadeGerada, notificacao] = decisao.efeitos;
      await executar(tx, notificacao);
      const { penalidade } = await registrarPenalidadeEAvisar(tx, penalidadeGerada);
      const { id, em } = penalidade;
      request.log.info(
        { evento: penalidadeGerada.evento, reservaId: cancelada.id },
        penalidadeGerada.evento,
      );
      return {
        reserva: paraResposta(cancelada),
        penalidade: { id, motivo: 'CancelamentoTardio' as const, em: paraIsoSaoPaulo(em) },
      };
    },
  );

  rotas.get(
    '/api/gestao/pedidos',
    {
      schema: {
        summary:
          'Fila dos Pedidos Pendentes dos Recursos do Gestor, pelo início, com a Série como um item só (US11, RN21)',
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
          serieId: true,
          inicio: true,
          fim: true,
          participantes: true,
          finalidade: true,
          recurso: { select: { id: true, nome: true, tipo: true, capacidade: true } },
          usuario: { select: { id: true, nome: true, perfil: true } },
        },
        orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
      });
      return filaDoGestor(pedidos, POLITICA).map(
        ({ inicio, fim, expiraEm, reservas, usuario, ...item }) => ({
          ...item,
          inicio: paraIsoSaoPaulo(inicio),
          fim: paraIsoSaoPaulo(fim),
          expiraEm: paraIsoSaoPaulo(expiraEm),
          reservas: reservas.map((ocorrencia) => ({
            id: ocorrencia.id,
            inicio: paraIsoSaoPaulo(ocorrencia.inicio),
            fim: paraIsoSaoPaulo(ocorrencia.fim),
          })),
          solicitante: usuario,
        }),
      );
    },
  );

  rotas.post(
    '/api/series/:id/aprovacao',
    {
      schema: {
        summary:
          'Aprova a Série inteira: confirma todas as Ocorrências Pendentes (US11, RN12, RN13, RN21)',
        tags: ['ciclo'],
        params: esquemaIdDaSerie,
        response: { 200: esquemaSerieDecidida },
      },
    },
    async (request) => {
      const quem = await exigirPerfil(request, 'Gestor');
      const fatos = await fatosDaSerie(request.tx, request.params.id);
      const decisao = decidirAprovacaoDaSerie(fatos, quem, request.agora);
      const reservas = await executarDecisaoDaSerie(request, decisao);
      return { reservas: reservas.map(paraResposta) };
    },
  );

  rotas.post(
    '/api/series/:id/recusa',
    {
      schema: {
        summary:
          'Recusa a Série inteira, com a mesma justificativa em todas as Ocorrências Pendentes (US11, RN11, RN12, RN13, RN21)',
        tags: ['ciclo'],
        params: esquemaIdDaSerie,
        body: esquemaRecusa,
        response: { 200: esquemaSerieDecidida },
      },
    },
    async (request) => {
      const quem = await exigirPerfil(request, 'Gestor');
      const fatos = await fatosDaSerie(request.tx, request.params.id);
      const decisao = decidirRecusaDaSerie(fatos, request.body, quem, request.agora);
      const reservas = await executarDecisaoDaSerie(request, decisao);
      return { reservas: reservas.map(paraResposta) };
    },
  );

  rotas.post(
    '/api/reservas/:id/aprovacao',
    {
      schema: {
        summary:
          'Aprova o Pedido Pendente pelo Gestor responsável; a Ocorrência de Série, só pela Série (US11, RN12, RN13, RN21)',
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
        summary:
          'Recusa o Pedido Pendente com justificativa; a Ocorrência de Série, só pela Série (US11, RN11, RN12, RN13, RN21)',
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
