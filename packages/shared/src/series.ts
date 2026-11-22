import { z } from 'zod';
import { POLITICA } from './politica';
import { esquemaInstante } from './instante';
import {
  esquemaCriarReserva,
  esquemaIdDaReserva,
  esquemaPenalidadeDoCancelamento,
  esquemaReserva,
} from './reservas';

const esquemaData = z.iso.date();

/**
 * US09: o Intervalo da primeira Ocorrência, que se repete toda semana até `ate`. As datas
 * desmarcadas nem são validadas (RN21).
 */
export const esquemaCriarSerie = esquemaCriarReserva.extend({
  ate: esquemaData.describe('A data da última Ocorrência possível, `YYYY-MM-DD`'),
  datasExcluidas: z
    .array(esquemaData)
    .max(POLITICA.semanasMaximasDaSerie)
    .default([])
    .describe('Datas da Série que não viram Ocorrência (feriados, recessos)'),
});

export type CriarSerie = z.input<typeof esquemaCriarSerie>;

export const esquemaSerieCriada = z.object({
  serie: z.object({
    id: z.number().int(),
    recursoId: z.number().int(),
    criadaEm: esquemaInstante,
  }),
  reservas: z.array(esquemaReserva).describe('As Ocorrências, da primeira à última'),
});

export type SerieCriada = z.infer<typeof esquemaSerieCriada>;

const DIA = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` em dias desde 1970. Só calendário, sem fuso. */
function emDias(data: string) {
  const [ano, mes, dia] = data.split('-').map(Number);
  return Date.UTC(ano!, mes! - 1, dia!) / DIA;
}

function deDias(dias: number) {
  return new Date(dias * DIA).toISOString().slice(0, 10);
}

/**
 * As datas da Série: `primeira` e cada semana depois dela, até `ate` inclusive, no máximo
 * `limite` datas. A tela mostra todas antes de criar, e o núcleo valida as mesmas (RN21).
 */
export function datasDaSerie(primeira: string, ate: string, limite: number): string[] {
  const datas: string[] = [];
  const ultima = emDias(ate);
  for (let dia = emDias(primeira); dia <= ultima && datas.length < limite; dia += 7) {
    datas.push(deDias(dia));
  }
  return datas;
}

/** O id da Série segue a mesma forma do id da Reserva (INT4 no banco), sem repetir o limite. */
export const esquemaIdDaSerie = esquemaIdDaReserva;

/** US11 e RN21: a Série decidida inteira, com as Ocorrências que a decisão mudou. */
export const esquemaSerieDecidida = z.object({
  reservas: z.array(esquemaReserva).describe('As Ocorrências decididas, da primeira à última'),
});

export type SerieDecidida = z.infer<typeof esquemaSerieDecidida>;

/** US09, US13, RN16 e RN21: o dono cancela as Ocorrências da Série a partir de uma data. */
export const esquemaCancelarSerie = z.strictObject({
  aPartirDe: esquemaData.describe(
    'Primeira data (`YYYY-MM-DD`, em São Paulo) a cancelar na Série (RN16, RN21)',
  ),
});

export type CancelarSerie = z.infer<typeof esquemaCancelarSerie>;

/** US09, US13, RN16 e RN21: as Ocorrências canceladas da Série e as Penalidades geradas. */
export const esquemaCancelamentoDaSerie = z.object({
  canceladas: z.array(esquemaReserva).describe('As Ocorrências canceladas, da primeira à última'),
  penalidades: z
    .array(esquemaPenalidadeDoCancelamento)
    .describe('As Penalidades de Cancelamento tardio geradas (RN16)'),
});

export type CancelamentoDaSerie = z.infer<typeof esquemaCancelamentoDaSerie>;
