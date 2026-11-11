import type { Ocupacao } from '@reservas/shared';
import { ROTULO_DO_STATUS } from '../reservas';
import { instanteDe, type DiaDaGrade } from './grade';

/** O que a célula conta ao Gestor responsável sobre a Reserva que a ocupa (RN22). */
export interface ReservaNaCelula {
  /** Primeira célula da Reserva no dia: só ela mostra o `texto`, para não repetir. */
  primeira: boolean;
  /** Curto, cabe na célula: `Bruno · Pendente`. */
  texto: string;
  /** Completo, para o leitor de tela e o `title`: inclui a Finalidade. */
  descricao: string;
  /** O detalhe da Reserva, que mostra a Finalidade: no toque não há `title`. */
  endereco: string;
}

/**
 * RN22: a Reserva na meia hora que começa em `minuto`, com quem reservou, o Status e a Finalidade.
 * `ocupacao` é a que a `celulaDaGrade` achou. `null` se a célula não tem Reserva ou se a API não
 * mandou o nome (quem vê não é o Gestor responsável).
 */
export function reservaNaCelula(
  dia: DiaDaGrade,
  minuto: number,
  ocupacao: Ocupacao | undefined,
): ReservaNaCelula | null {
  if (!ocupacao?.usuario || !ocupacao.status || ocupacao.reservaId === undefined) return null;
  const { nome } = ocupacao.usuario;
  const status = ROTULO_DO_STATUS[ocupacao.status];
  const finalidade = ocupacao.finalidade ? `Finalidade: ${ocupacao.finalidade}` : 'sem Finalidade';
  return {
    // A Reserva começa nesta meia hora, ou já vinha de antes da abertura do dia.
    primeira: minuto <= dia.abre || Date.parse(ocupacao.inicio) >= instanteDe(dia.data, minuto),
    texto: `${nome} · ${status}`,
    descricao: `Reserva de ${nome}, ${status}, ${finalidade}`,
    endereco: `/reservas/${ocupacao.reservaId}`,
  };
}
