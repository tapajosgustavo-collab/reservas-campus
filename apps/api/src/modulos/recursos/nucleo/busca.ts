import { TZDate } from '@date-fns/tz';
import { STATUS_ATIVOS, type Horario, type Status } from '@reservas/shared';
import { getDay } from 'date-fns';
import { FUSO } from '../../../comum/instante';

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

function ehAtiva({ status }: ReservaNaBusca) {
  return (STATUS_ATIVOS as readonly Status[]).includes(status);
}

/** O Intervalo no calendário de São Paulo: dia da semana e minutos desde 0h. */
function noDia({ inicio, fim }: Intervalo) {
  const local = new TZDate(inicio, FUSO);
  const de = local.getHours() * 60 + local.getMinutes() + local.getSeconds() / 60;
  return { diaSemana: getDay(local), de, ate: de + (fim.getTime() - inicio.getTime()) / MINUTO };
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
