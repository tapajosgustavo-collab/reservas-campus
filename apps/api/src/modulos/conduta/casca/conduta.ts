import { esquemaConduta, POLITICA } from '@reservas/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { paraIsoSaoPaulo } from '../../../comum/instante';
import { exigirPerfil } from '../../../comum/sessao';
import { condutaDoUsuario } from '../nucleo/conduta';

/** `GET /api/conduta`: as Penalidades e a Suspensão do Usuário da sessão (US02). */
export function registrarRotasDaConduta(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.get(
    '/api/conduta',
    {
      schema: {
        summary:
          'Minha conduta: as Penalidades, quais ainda contam e até quando estou suspenso (US02, RN19, RN20)',
        tags: ['conduta'],
        response: { 200: esquemaConduta },
      },
    },
    async (request) => {
      // O Gestor não reserva (POLITICA só tem Aluno e Docente), então não tem conduta.
      const quem = await exigirPerfil(request, 'Aluno', 'Docente');
      const [penalidades, suspensoes] = await Promise.all([
        request.tx.penalidade.findMany({
          where: { usuarioId: quem.id },
          select: {
            id: true,
            motivo: true,
            em: true,
            suspensaoId: true,
            reserva: {
              select: {
                id: true,
                inicio: true,
                fim: true,
                recurso: { select: { id: true, nome: true, tipo: true } },
              },
            },
          },
          orderBy: [{ em: 'desc' }, { id: 'desc' }],
        }),
        request.tx.suspensao.findMany({
          where: { usuarioId: quem.id },
          select: { inicio: true, fim: true },
        }),
      ]);

      const conduta = condutaDoUsuario(
        { penalidades, suspensoes, politica: POLITICA },
        request.agora,
      );
      return {
        suspensoAte: conduta.suspensoAte && paraIsoSaoPaulo(conduta.suspensoAte),
        penalidadesQueContam: conduta.penalidadesQueContam,
        penalidades: conduta.penalidades.map(({ id, motivo, em, contaParaSuspensao, reserva }) => ({
          id,
          motivo,
          em: paraIsoSaoPaulo(em),
          contaParaSuspensao,
          reserva: {
            ...reserva,
            inicio: paraIsoSaoPaulo(reserva.inicio),
            fim: paraIsoSaoPaulo(reserva.fim),
          },
        })),
      };
    },
  );
}
