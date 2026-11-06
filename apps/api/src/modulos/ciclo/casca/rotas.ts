import { esquemaCancelamento, esquemaIdDaReserva } from '@reservas/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ErroApi, proibidoPelaRegra, regraViolada } from '../../../comum/erros';
import { paraIsoSaoPaulo } from '../../../comum/instante';
import { exigirSessao } from '../../../comum/sessao';
import { executar as executarEmReservas } from '../../reservas';
import { decidirCancelamento } from '../nucleo/cancelamento';

/** Rotas do M4: o Cancelamento (US13). */
export function registrarRotasDoCiclo(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

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
        reserva: {
          ...cancelada,
          inicio: paraIsoSaoPaulo(cancelada.inicio),
          fim: paraIsoSaoPaulo(cancelada.fim),
          criadaEm: paraIsoSaoPaulo(cancelada.criadaEm),
        },
        penalidade: null,
      };
    },
  );
}
