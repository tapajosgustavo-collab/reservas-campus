import { TZDate } from '@date-fns/tz';
import { formatISO } from 'date-fns';

export const FUSO = 'America/Sao_Paulo';

/** Instante em ISO 8601 com o deslocamento de São Paulo calculado pelo fuso, nunca fixo (RNF08). */
export function paraIsoSaoPaulo(instante: Date): string {
  return formatISO(new TZDate(instante, FUSO));
}
