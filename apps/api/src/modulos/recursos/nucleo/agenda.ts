import { STATUS_ATIVOS, type Recurso, type Status, type StatusAtivo } from '@reservas/shared';
import type { Quem } from './recurso';

/** Quem reservou: só o Gestor responsável pelo Recurso vê o nome (RN22). */
export interface UsuarioDaReserva {
  id: number;
  nome: string;
}

/** O que a agenda precisa saber de cada Reserva do Recurso na semana. */
export interface ReservaNaAgenda {
  id: number;
  usuario: UsuarioDaReserva;
  inicio: Date;
  fim: Date;
  status: Status;
  finalidade: string | null;
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

/**
 * Qualquer Usuário vê só `inicio` e `fim`; o dono vê também `minha`, `reservaId` e `status`; o
 * Gestor responsável vê `reservaId`, `status`, `usuario` e `finalidade` (RN22).
 */
export interface OcupacaoNaAgenda {
  inicio: Date;
  fim: Date;
  minha?: true;
  reservaId?: number;
  status?: StatusAtivo;
  usuario?: UsuarioDaReserva;
  finalidade?: string | null;
}

export interface AgendaDoRecurso extends Omit<FatosDaAgenda, 'reservas'> {
  ocupacoes: OcupacaoNaAgenda[];
}

function ehAtiva(reserva: ReservaNaAgenda): reserva is ReservaNaAgenda & { status: StatusAtivo } {
  return (STATUS_ATIVOS as readonly Status[]).includes(reserva.status);
}

/**
 * US07: a agenda da semana de um Recurso como `quem` pode vê-la. Só as Reservas ativas ocupam.
 * RN22: o Gestor responsável vê quem reservou, o Status e a Finalidade; o dono vê a própria
 * Reserva e o Status; dos outros sai só o Intervalo.
 */
export function agendaPara(quem: Quem, { reservas, ...fatos }: FatosDaAgenda): AgendaDoRecurso {
  const ehGestorResponsavel = quem.id === fatos.recurso.gestor.id;
  return {
    ...fatos,
    ocupacoes: reservas
      .filter(ehAtiva)
      .map(({ id, usuario, inicio, fim, status, finalidade }): OcupacaoNaAgenda => {
        if (ehGestorResponsavel) return { inicio, fim, reservaId: id, status, usuario, finalidade };
        if (usuario.id === quem.id) return { inicio, fim, minha: true, reservaId: id, status };
        return { inicio, fim };
      }),
  };
}
