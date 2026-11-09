import { esquemaIdDaReserva, esquemaReserva, POLITICA } from '@reservas/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ErroApi, proibidoPelaRegra, regraViolada } from '../../../comum/erros';
import { paraIsoSaoPaulo } from '../../../comum/instante';
import { exigirSessao } from '../../../comum/sessao';
import { executar as executarEmReservas } from '../../reservas';
import { decidirCheckIn } from '../nucleo/check-in';

/** Rotas do M4: o Check-in (US12). */
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
      return {
        ...emUso,
        inicio: paraIsoSaoPaulo(emUso.inicio),
        fim: paraIsoSaoPaulo(emUso.fim),
        criadaEm: paraIsoSaoPaulo(emUso.criadaEm),
      };
    },
  );
}
