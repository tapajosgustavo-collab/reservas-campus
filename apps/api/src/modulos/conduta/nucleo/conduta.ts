import {
  inicioDaJanela,
  suspensoAte,
  type PenalidadeDoHistorico,
  type PeriodoDeSuspensao,
  type PoliticaDaSuspensao,
} from './suspensao';

export interface FatosDaConduta<P extends PenalidadeDoHistorico> {
  /** O histórico inteiro do Usuário: a Penalidade nunca sai dele (RN19). */
  penalidades: readonly P[];
  suspensoes: readonly PeriodoDeSuspensao[];
  politica: PoliticaDaSuspensao;
}

export interface Conduta<P extends PenalidadeDoHistorico> {
  /** Até quando vale a Suspensão em vigor, ou `null` (RN09, RN19). */
  suspensoAte: Date | null;
  /** Quantas ainda contam para a próxima Suspensão (RN19, RN20). */
  penalidadesQueContam: number;
  penalidades: (P & { contaParaSuspensao: boolean })[];
}

/** RN19: a Penalidade está na janela móvel que termina no `agora` (o começo fica de fora). */
function naJanela({ em }: { em: Date }, agora: Date, politica: PoliticaDaSuspensao) {
  return (
    em.getTime() > inicioDaJanela(agora, politica).getTime() && em.getTime() <= agora.getTime()
  );
}

/**
 * US02: a conduta do Usuário no `agora`, na ordem do histórico recebido. A Penalidade conta para
 * a próxima Suspensão enquanto está na janela móvel (RN19) e ainda não causou uma Suspensão (RN20).
 */
export function condutaDoUsuario<P extends PenalidadeDoHistorico>(
  { penalidades, suspensoes, politica }: FatosDaConduta<P>,
  agora: Date,
): Conduta<P> {
  const comContagem = penalidades.map((penalidade) => ({
    ...penalidade,
    contaParaSuspensao: penalidade.suspensaoId === null && naJanela(penalidade, agora, politica),
  }));
  return {
    suspensoAte: suspensoAte(suspensoes, agora),
    penalidadesQueContam: comContagem.filter((p) => p.contaParaSuspensao).length,
    penalidades: comContagem,
  };
}

/**
 * US11: as Penalidades do solicitante nos últimos 30 dias, para o Gestor decidir com contexto.
 * Contam todas as da janela, também as que já causaram uma Suspensão: é o histórico recente, não
 * a contagem da RN20.
 */
export function penalidadesNaJanela(
  penalidades: readonly { em: Date }[],
  agora: Date,
  politica: PoliticaDaSuspensao,
): number {
  return penalidades.filter((penalidade) => naJanela(penalidade, agora, politica)).length;
}
