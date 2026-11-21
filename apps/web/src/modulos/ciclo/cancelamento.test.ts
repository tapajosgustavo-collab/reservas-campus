import { describe, expect, it } from 'vitest';
import {
  cancelarGeraPenalidade,
  cancelarSerieGeraPenalidade,
  dataDaOcorrencia,
  msAteInicio,
  ocorrenciasCancelaveisDaSerie,
  podeCancelar,
} from './cancelamento';

/** A Reserva Confirmada das 14h de terça, 10/11/2026. */
const dasQuatorze = { status: 'Confirmada', inicio: '2026-11-10T14:00:00-03:00' } as const;

/** O `agora` da API às `hora` da mesma terça. */
const as = (hora: string) => `2026-11-10T${hora}:00-03:00`;

describe('RN16 · Botão de cancelar só antes do início em Pendente ou Confirmada', () => {
  it.each([
    ['12:30', true],
    ['13:59', true],
    ['14:00', false],
    ['14:01', false],
  ])('Reserva Confirmada às 14h, agora %s → botão %s', (hora, aparece) => {
    expect(podeCancelar(dasQuatorze, as(hora))).toBe(aparece);
  });

  it('Reserva Pendente antes do início → aparece', () => {
    expect(podeCancelar({ ...dasQuatorze, status: 'Pendente' }, as('12:30'))).toBe(true);
  });

  it('o agora da API vale com qualquer deslocamento: 16h30 em UTC são 13h30 em São Paulo', () => {
    expect(podeCancelar(dasQuatorze, '2026-11-10T16:30:00Z')).toBe(true);
  });

  it.each([
    'EmUso',
    'Cancelada',
    'Concluida',
    'Recusada',
    'Expirada',
    'NaoComparecimento',
  ] as const)('Reserva %s, mesmo antes do início → sem botão', (status) => {
    expect(podeCancelar({ ...dasQuatorze, status }, as('12:30'))).toBe(false);
  });
});

describe('RN16 · O botão some no início sem recarregar a tela', () => {
  const MINUTO = 60_000;

  it('antes do início: consultar o agora da API de novo quando chegar o início (30 min)', () => {
    expect(msAteInicio(dasQuatorze, as('13:30'))).toBe(30 * MINUTO);
  });

  it('no início ou depois: nada mais a esperar', () => {
    expect(msAteInicio(dasQuatorze, as('14:00'))).toBeNull();
  });

  it('Reserva que já não pode ser cancelada: nada a esperar', () => {
    expect(msAteInicio({ ...dasQuatorze, status: 'EmUso' }, as('13:50'))).toBeNull();
  });
});

describe('RN16 · a confirmação de cancelar avisa do Cancelamento tardio', () => {
  it.each([
    ['11:00', false],
    ['12:00', false],
    ['12:01', true],
    ['13:59', true],
  ])('Reserva Confirmada às 14h, agora %s → avisa: %s', (hora, avisa) => {
    expect(cancelarGeraPenalidade(dasQuatorze, as(hora))).toBe(avisa);
  });

  it('Reserva Pendente nunca gera Penalidade → sem aviso', () => {
    expect(cancelarGeraPenalidade({ ...dasQuatorze, status: 'Pendente' }, as('13:00'))).toBe(false);
  });
});

describe('US09 · US13 · RN16 · RN21 · Cancelar Série a partir de uma data na tela', () => {
  const ocorrencias = [
    {
      id: 51,
      status: 'Confirmada' as const,
      inicio: '2026-11-10T14:00:00-03:00',
      fim: '2026-11-10T16:00:00-03:00',
    },
    {
      id: 52,
      status: 'Confirmada' as const,
      inicio: '2026-11-17T14:00:00-03:00',
      fim: '2026-11-17T16:00:00-03:00',
    },
    {
      id: 53,
      status: 'Confirmada' as const,
      inicio: '2026-11-24T14:00:00-03:00',
      fim: '2026-11-24T16:00:00-03:00',
    },
  ];

  it('RNF08 · extrai a data da Ocorrência no calendário de São Paulo, mesmo com instante em UTC', () => {
    expect(dataDaOcorrencia({ inicio: '2026-11-18T01:00:00Z' })).toBe('2026-11-17');
  });

  it('RN16 · RN21 · filtra só as Ocorrências que ainda podem ser canceladas (Pendente ou Confirmada antes do início) e as ordena por início', () => {
    const mistas = [
      ocorrencias[2]!,
      { ...ocorrencias[0]!, status: 'EmUso' as const },
      ocorrencias[1]!,
    ];

    expect(ocorrenciasCancelaveisDaSerie(mistas, as('13:00')).map(({ id }) => id)).toEqual([
      52, 53,
    ]);
    // Às 14h00 de 10/11 a primeira já começou: só 17/11 e 24/11 continuam canceláveis.
    expect(ocorrenciasCancelaveisDaSerie(ocorrencias, as('14:00')).map(({ id }) => id)).toEqual([
      52, 53,
    ]);
  });

  it('RN16 · RN21 · indica quais Ocorrências serão canceladas a partir da data escolhida e se alguma gera Penalidade por Cancelamento tardio', () => {
    // Às 12h30 de 10/11 (faltam 1h30 para a de 10/11): cancelar a partir de 10/11 gera Penalidade;
    // cancelar a partir de 17/11 não gera Penalidade.
    expect(cancelarSerieGeraPenalidade(ocorrencias, '2026-11-10', as('12:30'))).toBe(true);
    expect(cancelarSerieGeraPenalidade(ocorrencias, '2026-11-17', as('12:30'))).toBe(false);
    expect(cancelarSerieGeraPenalidade(ocorrencias, '2026-11-10', as('12:00'))).toBe(false);
  });
});
