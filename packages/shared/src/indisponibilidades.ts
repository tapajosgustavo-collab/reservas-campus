import { z } from 'zod';
import { esquemaInstante as instante } from './instante';

const MEIA_HORA_MS = 30 * 60_000;

/** O deslocamento de São Paulo é de horas inteiras: a meia hora não depende do fuso. */
const naMeiaHora = instante.refine((valor) => Date.parse(valor) % MEIA_HORA_MS === 0, {
  error: 'use múltiplos de 30 minutos',
});

/** US05. Só a forma; quem pode e o que é cancelado, o núcleo decide (RN13, RN04). */
export const esquemaCriarIndisponibilidade = z
  .strictObject({
    inicio: naMeiaHora,
    fim: naMeiaHora.nullable().describe('`null` = sem previsão de volta (tirar de uso)'),
    motivo: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe('Vai na Notificação de quem perder a Reserva'),
  })
  .refine(({ inicio, fim }) => fim === null || Date.parse(fim) > Date.parse(inicio), {
    error: 'o fim precisa ser depois do início',
    path: ['fim'],
  });

export type CriarIndisponibilidade = z.infer<typeof esquemaCriarIndisponibilidade>;

export const esquemaIndisponibilidade = z.object({
  id: z.number().int(),
  recursoId: z.number().int(),
  inicio: instante,
  fim: instante.nullable(),
  motivo: z.string(),
  criadaEm: instante,
});

export const esquemaIndisponibilidadeCriada = z.object({
  indisponibilidade: esquemaIndisponibilidade,
  reservasCanceladas: z
    .number()
    .int()
    .describe('Pendentes e Confirmadas no período, com Cancelamento pelo sistema (RN04)'),
});

export type IndisponibilidadeCriada = z.infer<typeof esquemaIndisponibilidadeCriada>;
