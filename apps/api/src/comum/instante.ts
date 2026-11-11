import { TZDate } from '@date-fns/tz';
import { addDays, format, formatISO, getDay, startOfWeek } from 'date-fns';

export const FUSO = 'America/Sao_Paulo';

/** Instante em ISO 8601 com o deslocamento de São Paulo calculado pelo fuso, nunca fixo (RNF08). */
export function paraIsoSaoPaulo(instante: Date): string {
  return formatISO(new TZDate(instante, FUSO));
}

/** A hora do instante em São Paulo, como as mensagens das RNs mostram: `09:45`. */
export function horaEmSaoPaulo(instante: Date): string {
  return format(new TZDate(instante, FUSO), 'HH:mm');
}

/** O Intervalo em São Paulo, como as Notificações mostram: `11/11/2026, das 14:00 às 16:00`. */
export function intervaloEmSaoPaulo(inicio: Date, fim: Date): string {
  const comeca = new TZDate(inicio, FUSO);
  return `${format(comeca, 'dd/MM/yyyy')}, das ${format(comeca, 'HH:mm')} às ${horaEmSaoPaulo(fim)}`;
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

/** O instante de `minutos` desde 0h do dia `data` (`YYYY-MM-DD`) em São Paulo; 1440 = 0h do dia seguinte. */
export function instanteEmSaoPaulo(data: string, minutos: number): Date {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(new TZDate(ano!, mes! - 1, dia!, 0, minutos, FUSO).getTime());
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
