import { TZDate } from '@date-fns/tz';
import { addDays, format, formatISO, getDay, startOfWeek } from 'date-fns';

export const FUSO = 'America/Sao_Paulo';

/** Instante em ISO 8601 com o deslocamento de São Paulo calculado pelo fuso, nunca fixo (RNF08). */
export function paraIsoSaoPaulo(instante: Date): string {
  return formatISO(new TZDate(instante, FUSO));
}

/** Onde um instante cai no calendário de São Paulo. */
export interface NoCalendario {
  /** `YYYY-MM-DD`. */
  data: string;
  /** 0 = domingo. */
  diaSemana: number;
  /** Desde 0h, com fração se o instante não cai num minuto exato. */
  minutos: number;
}

export function emSaoPaulo(instante: Date): NoCalendario {
  const local = new TZDate(instante, FUSO);
  return {
    data: format(local, 'yyyy-MM-dd'),
    diaSemana: getDay(local),
    minutos:
      local.getHours() * 60 +
      local.getMinutes() +
      local.getSeconds() / 60 +
      local.getMilliseconds() / 60_000,
  };
}

/** A segunda-feira (`YYYY-MM-DD`) da semana de `instante` em São Paulo. */
export function segundaDaSemana(instante: Date): string {
  return format(startOfWeek(new TZDate(instante, FUSO), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

/** De 0h da `segunda` a 0h da segunda seguinte, em São Paulo. */
export function limitesDaSemana(segunda: string): { inicio: Date; fim: Date } {
  const [ano, mes, dia] = segunda.split('-').map(Number);
  const inicio = new TZDate(ano!, mes! - 1, dia!, FUSO);
  return { inicio: new Date(inicio.getTime()), fim: new Date(addDays(inicio, 7).getTime()) };
}
