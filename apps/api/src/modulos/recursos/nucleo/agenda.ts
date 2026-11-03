import { STATUS_ATIVOS, type Recurso, type Status, type StatusAtivo } from '@reservas/shared';
import type { Quem } from './recurso';

/** O que a agenda precisa saber de cada Reserva do Recurso na semana. */
export interface ReservaNaAgenda {
  id: number;
  usuarioId: number;
  inicio: Date;
  fim: Date;
  status: Status;
}

export interface IndisponibilidadeNaAgenda {
  inicio: Date;
  fim: Date | null;
  motivo: string;
}

export interface FatosDaAgenda {
  agora: Date;
  recurso: Recurso;
  indisponibilidades: IndisponibilidadeNaAgenda[];
  reservas: ReservaNaAgenda[];
}

/** Qualquer Usuário vê só `inicio` e `fim`; o dono vê também `minha`, `reservaId` e `status`. */
export interface OcupacaoNaAgenda {
  inicio: Date;
  fim: Date;
  minha?: true;
  reservaId?: number;
  status?: StatusAtivo;
}

export interface AgendaDoRecurso extends Omit<FatosDaAgenda, 'reservas'> {
  ocupacoes: OcupacaoNaAgenda[];
}

function ehAtiva(reserva: ReservaNaAgenda): reserva is ReservaNaAgenda & { status: StatusAtivo } {
  return (STATUS_ATIVOS as readonly Status[]).includes(reserva.status);
}

/**
 * US07: a agenda da semana de um Recurso como `quem` pode vê-la. Só as Reservas ativas ocupam, e
 * de quem não é o dono sai só o Intervalo, nem o Status (RN22).
 */
export function agendaPara(quem: Quem, { reservas, ...fatos }: FatosDaAgenda): AgendaDoRecurso {
  return {
    ...fatos,
    ocupacoes: reservas
      .filter(ehAtiva)
      .map(({ id, usuarioId, inicio, fim, status }) =>
        usuarioId === quem.id
          ? { inicio, fim, minha: true, reservaId: id, status }
          : { inicio, fim },
      ),
  };
}
