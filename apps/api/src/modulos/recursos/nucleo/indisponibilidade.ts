import { violacao, type Status, type Violacao } from '@reservas/shared';
import { horaEmSaoPaulo } from '../../../comum/instante';
import type { ReservasCanceladasPeloSistema } from '../../reservas';
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
  | {
      tipo: 'aceita';
      efeitos: [IndisponibilidadeCriada] | [IndisponibilidadeCriada, ReservasCanceladasPeloSistema];
    }
  | { tipo: 'recusada'; violacoes: Violacao[] }
  | { tipo: 'proibida'; violacoes: Violacao[] };

const MEIA_HORA_MS = 30 * 60_000;

/** RN04: só a Pendente e a Confirmada são canceladas; a Em uso continua até o fim. */
const CANCELAVEIS: readonly Status[] = ['Pendente', 'Confirmada'];

/** O Intervalo `[inicio, fim)` toca o período? Sem fim, o período não acaba. */
function noPeriodo({ inicio, fim }: PedidoDeIndisponibilidade, reserva: ReservaNoPeriodo) {
  return reserva.fim > inicio && (fim === null || reserva.inicio < fim);
}

/**
 * RN04: começar no passado cancelaria sem Penalidade Reservas que o tempo já resolveu (Não
 * comparecimento, Cancelamento tardio). O primeiro horário possível é a próxima meia hora.
 */
function noPassado(inicio: Date, agora: Date): Violacao[] {
  if (inicio >= agora) return [];
  const primeiro = new Date(Math.ceil(agora.getTime() / MEIA_HORA_MS) * MEIA_HORA_MS);
  return [
    violacao(
      'RN04',
      'A Indisponibilidade não pode começar no passado: ' +
        `o primeiro horário possível é ${horaEmSaoPaulo(primeiro)}.`,
    ),
  ];
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
  // RN13, regra de dono (403): vem antes das outras.
  if (quem.id !== recurso.gestorId) {
    return {
      tipo: 'proibida',
      violacoes: [
        violacao(
          'RN13',
          'Só o Gestor responsável por este Recurso pode marcá-lo como indisponível.',
        ),
      ],
    };
  }

  const violacoes = noPassado(pedido.inicio, agora);
  if (violacoes.length > 0) return { tipo: 'recusada', violacoes };

  const criada: IndisponibilidadeCriada = {
    evento: 'IndisponibilidadeCriada',
    indisponibilidade: { ...pedido, recursoId: recurso.id, criadaEm: agora },
  };
  const atingidas = reservas
    .filter((reserva) => CANCELAVEIS.includes(reserva.status) && noPeriodo(pedido, reserva))
    .map(({ id, status }) => ({ id, de: status }));
  if (atingidas.length === 0) return { tipo: 'aceita', efeitos: [criada] };
  return {
    tipo: 'aceita',
    efeitos: [
      criada,
      {
        evento: 'ReservasCanceladasPeloSistema',
        reservas: atingidas,
        em: agora,
        observacao: `Cancelamento pelo sistema: o Recurso ficou indisponível (${pedido.motivo}).`,
      },
    ],
  };
}
