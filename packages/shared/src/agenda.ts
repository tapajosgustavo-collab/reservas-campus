import { z } from 'zod';
import { esquemaInstante as instante } from './instante';
import { esquemaRecurso } from './recursos';
import { STATUS_ATIVOS } from './reservas';

/** `YYYY-MM-DD` é segunda-feira? Só olha o calendário, sem fuso. */
function ehSegunda(data: string) {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(Date.UTC(ano!, mes! - 1, dia!)).getUTCDay() === 1;
}

export const esquemaBuscarAgenda = z.object({
  semana: z.iso
    .date()
    .refine(ehSegunda, { error: 'a semana começa na segunda-feira' })
    .optional()
    .describe('Segunda-feira da semana (YYYY-MM-DD); sem ela, a semana do agora da API'),
});

export type BuscarAgenda = z.infer<typeof esquemaBuscarAgenda>;

/**
 * Uma Reserva ativa na agenda. Qualquer Usuário vê só `inicio` e `fim`; o dono vê também
 * `minha`, `reservaId` e `status` (RN22).
 */
export const esquemaOcupacao = z.object({
  inicio: instante,
  fim: instante,
  minha: z.literal(true).optional().describe('Só nas Reservas do Usuário da sessão'),
  reservaId: z.number().int().optional().describe('Só para o dono (RN22)'),
  status: z.enum(STATUS_ATIVOS).optional().describe('Só para o dono (RN22)'),
});

export type Ocupacao = z.infer<typeof esquemaOcupacao>;

export const esquemaIndisponibilidadeNaAgenda = z.object({
  inicio: instante,
  fim: instante.nullable().describe('`null` = sem previsão de volta'),
  motivo: z.string().describe('Público'),
});

export type IndisponibilidadeNaAgenda = z.infer<typeof esquemaIndisponibilidadeNaAgenda>;

export const esquemaAgenda = z.object({
  agora: instante.describe(
    'O agora da API: a tela calcula Passado com ele, não com o relógio dela',
  ),
  semana: z.iso.date().describe('Segunda-feira da semana mostrada; a agenda cobre 7 dias'),
  recurso: esquemaRecurso,
  indisponibilidades: z.array(esquemaIndisponibilidadeNaAgenda),
  ocupacoes: z.array(esquemaOcupacao).describe('Só Reservas ativas, por início'),
});

export type Agenda = z.infer<typeof esquemaAgenda>;
