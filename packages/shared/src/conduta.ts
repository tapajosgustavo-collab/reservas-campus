import { z } from 'zod';
import { esquemaInstante } from './instante';
import { esquemaTipoRecurso } from './recursos';

/** O que gerou a Penalidade, sem acento (spec §5). */
export const esquemaMotivoPenalidade = z.enum([
  'NaoComparecimento',
  'CancelamentoTardio',
  'DevolucaoAtrasada',
]);

export type MotivoPenalidade = z.infer<typeof esquemaMotivoPenalidade>;

/** US02: uma Penalidade do histórico, com a Reserva de origem. */
export const esquemaPenalidadeDaConduta = z.object({
  id: z.number().int(),
  motivo: esquemaMotivoPenalidade,
  em: esquemaInstante.describe('Quando o prazo venceu, não quando o sistema aplicou (ADR 0004)'),
  contaParaSuspensao: z
    .boolean()
    .describe(
      'Ainda conta para a próxima Suspensão: está nos últimos 30 dias (RN19) e não causou uma Suspensão (RN20)',
    ),
  reserva: z.object({
    id: z.number().int(),
    inicio: esquemaInstante,
    fim: esquemaInstante,
    recurso: z.object({ id: z.number().int(), nome: z.string(), tipo: esquemaTipoRecurso }),
  }),
});

export type PenalidadeDaConduta = z.infer<typeof esquemaPenalidadeDaConduta>;

/** US02: a conduta do Usuário da sessão. */
export const esquemaConduta = z.object({
  suspensoAte: esquemaInstante
    .nullable()
    .describe('Fim da Suspensão em vigor; `null` = não está suspenso (RN09, RN19)'),
  penalidadesQueContam: z
    .number()
    .int()
    .describe('Quantas Penalidades ainda contam para a próxima Suspensão (RN19, RN20)'),
  penalidades: z
    .array(esquemaPenalidadeDaConduta)
    .describe('Todo o histórico, da mais recente para a mais antiga'),
});

export type Conduta = z.infer<typeof esquemaConduta>;
