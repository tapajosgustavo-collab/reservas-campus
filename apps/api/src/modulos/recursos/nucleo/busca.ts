import type { Horario, Status } from '@reservas/shared';
import { emSaoPaulo } from '../../../comum/instante';
import { ehAtiva } from './agenda';

export interface ReservaNaBusca {
  inicio: Date;
  fim: Date;
  status: Status;
}

export interface RecursoNaBusca {
  horarios: Horario[];
  reservas: ReservaNaBusca[];
}

interface Intervalo {
  inicio: Date;
  fim: Date;
}

const MINUTO = 60_000;

function seSobrepoem(a: Intervalo, b: Intervalo) {
  return a.inicio < b.fim && b.inicio < a.fim;
}

/** O Intervalo no calendário de São Paulo: dia da semana e minutos desde 0h. */
function noDia({ inicio, fim }: Intervalo) {
  const { diaSemana, minutos } = emSaoPaulo(inicio);
  return { diaSemana, de: minutos, ate: minutos + (fim.getTime() - inicio.getTime()) / MINUTO };
}

function dentroDoHorario(horarios: Horario[], intervalo: Intervalo) {
  const dia = noDia(intervalo);
  const faixa = horarios.find(({ diaSemana }) => diaSemana === dia.diaSemana);
  return faixa !== undefined && faixa.abre <= dia.de && dia.ate <= faixa.fecha;
}

/**
 * US06: o Recurso está livre no Intervalo? Só se o Intervalo for válido (RN02), couber no
 * Horário de funcionamento daquele dia (RN03) e não tiver Conflito com Reserva ativa (RN01).
 * A Indisponibilidade entra com o #45.
 */
export function livreNoIntervalo(recurso: RecursoNaBusca, intervalo: Intervalo): boolean {
  return (
    intervalo.inicio < intervalo.fim &&
    dentroDoHorario(recurso.horarios, intervalo) &&
    !recurso.reservas.some((reserva) => ehAtiva(reserva) && seSobrepoem(reserva, intervalo))
  );
}
