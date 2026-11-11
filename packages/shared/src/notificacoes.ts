import { z } from 'zod';
import { esquemaInstante } from './instante';

export const NOTIFICACOES_POR_PAGINA = 20;

/** Tipo da Notificação, sem acento (spec §4 e §5). */
export const esquemaTipoNotificacao = z.enum([
  'Aprovacao',
  'Recusa',
  'Expiracao',
  'CancelamentoPeloSistema',
  'Penalidade',
  'DevolucaoAtrasada',
  'InicioSuspensao',
  'FimSuspensao',
  'Lembrete',
]);

export type TipoNotificacao = z.infer<typeof esquemaTipoNotificacao>;

export const esquemaBuscarNotificacoes = z.object({
  pagina: z.coerce.number().int().positive().max(1_000_000).default(1),
});

export type BuscarNotificacoes = z.infer<typeof esquemaBuscarNotificacoes>;

// O id é INT4 no banco: maior que isso nem chega ao Prisma.
export const esquemaIdDaNotificacao = z.object({
  id: z.coerce.number().int().positive().max(2_147_483_647),
});

export const esquemaNotificacao = z.object({
  id: z.number().int(),
  tipo: esquemaTipoNotificacao,
  mensagem: z.string(),
  em: esquemaInstante,
  lidaEm: esquemaInstante.nullable(),
  reservaId: z.number().int().nullable(),
});

export type Notificacao = z.infer<typeof esquemaNotificacao>;

export const esquemaPaginaDeNotificacoes = z.object({
  itens: z.array(esquemaNotificacao),
  total: z.number().int(),
  naoLidas: z.number().int(),
});

export type PaginaDeNotificacoes = z.infer<typeof esquemaPaginaDeNotificacoes>;
