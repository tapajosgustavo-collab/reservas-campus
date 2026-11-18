import type { Politica } from '@reservas/shared';

const DIA = 24 * 60 * 60_000;

export type PoliticaDaSuspensao = Pick<
  Politica,
  'penalidadesParaSuspensao' | 'janelaDePenalidadesDias' | 'suspensaoDias'
>;

/** Uma Penalidade que o Usuário já tem. `suspensaoId` preenchido = já causou Suspensão (RN20). */
export interface PenalidadeDoHistorico {
  id: number;
  em: Date;
  suspensaoId: number | null;
}

/**
 * A Suspensão que nasce com uma nova Penalidade. `penalidadeIds` são as Penalidades do histórico
 * que contaram junto com ela; a nova ainda não tem id, e quem a marca é a casca.
 */
export interface SuspensaoIniciada {
  inicio: Date;
  fim: Date;
  penalidadeIds: number[];
}

/** O período de uma Suspensão do Usuário. */
export interface PeriodoDeSuspensao {
  inicio: Date;
  fim: Date;
}

/** RN19: a janela móvel termina em `em` e começa aqui, sem incluir este instante. */
export function inicioDaJanela(em: Date, politica: PoliticaDaSuspensao): Date {
  return new Date(em.getTime() - politica.janelaDePenalidadesDias * DIA);
}

/**
 * RN19: na N-ésima Penalidade da janela móvel (contada para trás a partir da nova), nasce uma
 * Suspensão a partir dela. RN20: a Penalidade que já causou uma Suspensão não conta de novo.
 * As recebidas durante uma Suspensão contam normalmente.
 */
export function suspensaoPelaPenalidade(
  nova: { em: Date },
  historico: readonly PenalidadeDoHistorico[],
  politica: PoliticaDaSuspensao,
): SuspensaoIniciada | null {
  const desde = inicioDaJanela(nova.em, politica).getTime();
  const contam = historico.filter(
    (p) => p.suspensaoId === null && p.em.getTime() > desde && p.em.getTime() <= nova.em.getTime(),
  );
  if (contam.length + 1 < politica.penalidadesParaSuspensao) return null;

  return {
    inicio: nova.em,
    fim: new Date(nova.em.getTime() + politica.suspensaoDias * DIA),
    penalidadeIds: contam.map((p) => p.id),
  };
}

/**
 * RN09/RN19: até quando o Usuário está suspenso, ou `null` se não está. "Em vigor" é
 * `inicio <= agora < fim`; com mais de uma em vigor, vale o maior fim.
 */
export function suspensoAte(suspensoes: readonly PeriodoDeSuspensao[], agora: Date): Date | null {
  const fins = suspensoes
    .filter((s) => s.inicio.getTime() <= agora.getTime() && agora.getTime() < s.fim.getTime())
    .map((s) => s.fim.getTime());
  return fins.length > 0 ? new Date(Math.max(...fins)) : null;
}
