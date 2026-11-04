import { z } from 'zod';
import { esquemaInstante } from './instante';

/** Status da Reserva, sem acento (spec §5). */
export const esquemaStatus = z.enum([
  'Pendente',
  'Confirmada',
  'Recusada',
  'Expirada',
  'Cancelada',
  'EmUso',
  'Concluida',
  'NaoComparecimento',
]);

export type Status = z.infer<typeof esquemaStatus>;

/** Só as Reservas ativas ocupam o Recurso e contam na Cota. */
export const STATUS_ATIVOS = ['Pendente', 'Confirmada', 'EmUso'] as const satisfies Status[];

export type StatusAtivo = (typeof STATUS_ATIVOS)[number];

export const esquemaCriarReserva = z.object({
  recursoId: z.number().int().positive(),
  inicio: esquemaInstante,
  fim: esquemaInstante,
  participantes: z.number().int().positive().optional().describe('Só Espaço'),
  finalidade: z.string().trim().max(200).optional(),
});

export type CriarReserva = z.infer<typeof esquemaCriarReserva>;

export const esquemaReserva = z.object({
  id: z.number().int(),
  recursoId: z.number().int(),
  inicio: esquemaInstante,
  fim: esquemaInstante,
  participantes: z.number().int().nullable(),
  finalidade: z.string().nullable(),
  status: esquemaStatus,
  criadaEm: esquemaInstante,
});

export type Reserva = z.infer<typeof esquemaReserva>;
