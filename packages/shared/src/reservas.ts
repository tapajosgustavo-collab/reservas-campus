import { z } from 'zod';

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
