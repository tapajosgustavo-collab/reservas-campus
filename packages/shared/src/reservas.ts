import { z } from 'zod';
import { esquemaInstante } from './instante';
import { esquemaTipoRecurso } from './recursos';
import { esquemaPerfil } from './sessao';

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

export const RESERVAS_POR_PAGINA = 20;

/** Minhas reservas: as abas se separam pelo Status, não pela data (US10). */
export const esquemaSituacao = z.enum(['ativas', 'encerradas']);

export type Situacao = z.infer<typeof esquemaSituacao>;

export const esquemaBuscarReservas = z.object({
  situacao: esquemaSituacao.default('ativas'),
  pagina: z.coerce.number().int().positive().max(1_000_000).default(1),
});

// O id é INT4 no banco: maior que isso nem chega ao Prisma.
export const esquemaIdDaReserva = z.object({
  id: z.coerce.number().int().positive().max(2_147_483_647),
});

export const esquemaItemDeReserva = esquemaReserva.extend({
  serieId: z.number().int().nullable(),
  recurso: z.object({ id: z.number().int(), nome: z.string(), tipo: esquemaTipoRecurso }),
});

export type ItemDeReserva = z.infer<typeof esquemaItemDeReserva>;

export const esquemaPaginaDeReservas = z.object({
  itens: z.array(esquemaItemDeReserva),
  total: z.number().int(),
  pagina: z.number().int(),
  porPagina: z.number().int(),
});

export type PaginaDeReservas = z.infer<typeof esquemaPaginaDeReservas>;

export const esquemaPessoa = z.object({ id: z.number().int(), nome: z.string() });

export const esquemaTransicao = z.object({
  de: esquemaStatus.nullable().describe('Vazio na primeira transição'),
  para: esquemaStatus,
  em: esquemaInstante,
  por: esquemaPessoa.nullable().describe('Vazio = o sistema'),
  observacao: z.string().nullable(),
});

export type Transicao = z.infer<typeof esquemaTransicao>;

export const esquemaDetalheDaReserva = esquemaItemDeReserva.extend({
  usuario: esquemaPessoa,
  historico: z.array(esquemaTransicao).describe('Do mais antigo ao mais novo'),
});

export type DetalheDaReserva = z.infer<typeof esquemaDetalheDaReserva>;

/** US13: o Cancelamento tardio com Penalidade entra no incremento 4 (#61); até lá, `penalidade: null`. */
export const esquemaCancelamento = z.object({
  reserva: esquemaReserva,
  penalidade: z.null(),
});

export type Cancelamento = z.infer<typeof esquemaCancelamento>;

/** US14: o Gestor responsável registra a Devolução do Equipamento, com observação opcional (ou obrigatória em perda/roubo, RN17). */
export const esquemaDevolucao = z.strictObject({
  observacao: z.string().trim().max(200).optional(),
  extraviado: z
    .boolean()
    .optional()
    .describe('Equipamento perdido ou roubado: exige observação (RN17)'),
});

export type RegistrarDevolucao = z.infer<typeof esquemaDevolucao>;

/**
 * US11: um Pedido Pendente na fila do Gestor. Os dados de conduta do solicitante (`penalidades30d`,
 * `suspensoAte`) entram no incremento 4 (#58) e a Série como um item só, no 5 (#65).
 */
export const esquemaItemDaFila = z.object({
  id: z.number().int(),
  inicio: esquemaInstante,
  fim: esquemaInstante,
  expiraEm: esquemaInstante.describe('Prazo de decisão (RN12): depois dele, o Pedido expira'),
  participantes: z.number().int().nullable(),
  finalidade: z.string().nullable(),
  recurso: z.object({
    id: z.number().int(),
    nome: z.string(),
    tipo: esquemaTipoRecurso,
    capacidade: z.number().int().nullable().describe('Só Espaço'),
  }),
  solicitante: esquemaPessoa.extend({ perfil: esquemaPerfil }),
});

export type ItemDaFila = z.infer<typeof esquemaItemDaFila>;

export const esquemaFila = z
  .array(esquemaItemDaFila)
  .describe('Do início mais próximo ao mais distante');

export type Fila = z.infer<typeof esquemaFila>;

/** US11: a justificativa em branco passa na forma; quem a recusa é a RN11, no núcleo (422). */
export const esquemaRecusa = z.strictObject({
  justificativa: z.string().max(500).describe('Obrigatória (RN11): vai na Notificação ao Usuário'),
});

export type RecusarPedido = z.infer<typeof esquemaRecusa>;

export const esquemaItemEmUso = z.object({
  id: z.number().int(),
  inicio: esquemaInstante,
  fim: esquemaInstante,
  devolucaoAtrasada: z.boolean(),
  recurso: z.object({
    id: z.number().int(),
    nome: z.string(),
    patrimonio: z.string(),
  }),
  usuario: esquemaPessoa,
});

export type ItemEmUso = z.infer<typeof esquemaItemEmUso>;

export const esquemaEmUso = z.array(esquemaItemEmUso);

export type EmUso = z.infer<typeof esquemaEmUso>;
