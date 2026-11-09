import { violacao, type Status, type Violacao } from '@reservas/shared';
import type { StatusMudou } from '../../reservas';
import type { Quem, RecursoCadastrado } from './recurso';

/** O período e o motivo que o Gestor informou. `fim` vazio = sem previsão de volta. */
export interface PedidoDeIndisponibilidade {
  inicio: Date;
  fim: Date | null;
  motivo: string;
}

/** O que a regra precisa saber de cada Reserva do Recurso que toca o período. */
export interface ReservaNoPeriodo {
  id: number;
  inicio: Date;
  fim: Date;
  status: Status;
}

export interface FatosDaIndisponibilidade {
  recurso: RecursoCadastrado;
  reservas: ReservaNoPeriodo[];
}

export interface IndisponibilidadeCriada {
  evento: 'IndisponibilidadeCriada';
  indisponibilidade: PedidoDeIndisponibilidade & { recursoId: number; criadaEm: Date };
}

export type Decisao =
  | { tipo: 'aceita'; efeitos: [IndisponibilidadeCriada, ...StatusMudou[]] }
  | { tipo: 'recusada'; violacoes: Violacao[] };

/** RN04: só a Pendente e a Confirmada são canceladas; a Em uso continua até o fim. */
const CANCELAVEIS: readonly Status[] = ['Pendente', 'Confirmada'];

/** O Intervalo `[inicio, fim)` toca o período? Sem fim, o período não acaba. */
function noPeriodo({ inicio, fim }: PedidoDeIndisponibilidade, reserva: ReservaNoPeriodo) {
  return reserva.fim > inicio && (fim === null || reserva.inicio < fim);
}

/**
 * US05: o Gestor responsável marca o Recurso como indisponível (RN13). As Reservas Pendentes e
 * Confirmadas no período recebem Cancelamento pelo sistema, sem Penalidade (RN04). Tirar de uso é
 * uma Indisponibilidade sem fim.
 */
export function decidirIndisponibilidade(
  { recurso, reservas }: FatosDaIndisponibilidade,
  pedido: PedidoDeIndisponibilidade,
  quem: Quem,
  agora: Date,
): Decisao {
  if (quem.id !== recurso.gestorId) {
    return {
      tipo: 'recusada',
      violacoes: [
        violacao(
          'RN13',
          'Só o Gestor responsável por este Recurso pode marcá-lo como indisponível.',
        ),
      ],
    };
  }

  const observacao = `Cancelamento pelo sistema: o Recurso ficou indisponível (${pedido.motivo}).`;
  const cancelamentos = reservas
    .filter((reserva) => CANCELAVEIS.includes(reserva.status) && noPeriodo(pedido, reserva))
    .map(({ id, status }): StatusMudou => ({
      evento: 'StatusMudou',
      reservaId: id,
      transicao: { de: status, para: 'Cancelada', em: agora, porId: null, observacao },
    }));
  return {
    tipo: 'aceita',
    efeitos: [
      {
        evento: 'IndisponibilidadeCriada',
        indisponibilidade: { ...pedido, recursoId: recurso.id, criadaEm: agora },
      },
      ...cancelamentos,
    ],
  };
}
