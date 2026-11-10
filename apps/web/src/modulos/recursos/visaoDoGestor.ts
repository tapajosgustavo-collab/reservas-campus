import type { Ocupacao } from '@reservas/shared';
import { ROTULO_DO_STATUS } from '../reservas';
import { ocupacaoNa, type DiaDaGrade } from './grade';

/** O que a célula conta ao Gestor responsável sobre a Reserva que a ocupa (RN22). */
export interface ReservaNaCelula {
  /** Primeira célula da Reserva no dia: só ela mostra o `texto`, para não repetir. */
  primeira: boolean;
  /** Curto, cabe na célula: `Bruno · Pendente`. */
  texto: string;
  /** Completo, para o leitor de tela e o `title`: inclui a Finalidade. */
  descricao: string;
}

/**
 * RN22: a Reserva na meia hora que começa em `minuto`, com quem reservou, o Status e a Finalidade.
 * `null` se a célula não tem Reserva ou se a API não mandou o nome (quem vê não é o Gestor
 * responsável).
 */
export function reservaNaCelula(
  dia: DiaDaGrade,
  minuto: number,
  ocupacoes: Ocupacao[],
): ReservaNaCelula | null {
  const ocupacao = ocupacaoNa(dia, minuto, ocupacoes);
  if (!ocupacao?.usuario || !ocupacao.status) return null;
  const anterior = minuto > dia.abre ? ocupacaoNa(dia, minuto - 30, ocupacoes) : undefined;
  const { nome } = ocupacao.usuario;
  const status = ROTULO_DO_STATUS[ocupacao.status];
  const finalidade = ocupacao.finalidade ? `Finalidade: ${ocupacao.finalidade}` : 'sem Finalidade';
  return {
    primeira: anterior?.reservaId !== ocupacao.reservaId,
    texto: `${nome} · ${status}`,
    descricao: `Reserva de ${nome}, ${status}, ${finalidade}`,
  };
}
