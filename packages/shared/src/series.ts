import { z } from 'zod';
import { POLITICA } from './politica';
import { esquemaInstante } from './instante';
import { esquemaCriarReserva, esquemaReserva } from './reservas';

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
