import { describe, expect, it } from 'vitest';
import { limitesDaSemana, paraIsoSaoPaulo, segundaDaSemana } from './instante';

describe('RNF08 · Instantes no horário de São Paulo', () => {
  it('sai em ISO 8601 com o deslocamento de São Paulo', () => {
    expect(paraIsoSaoPaulo(new Date('2026-11-10T11:00:00Z'))).toBe('2026-11-10T08:00:00-03:00');
  });

  it('a virada do dia é a de São Paulo, não a do UTC', () => {
    expect(paraIsoSaoPaulo(new Date('2026-11-11T01:30:00Z'))).toBe('2026-11-10T22:30:00-03:00');
  });
});

describe('US07 · Semana da agenda em São Paulo', () => {
  it('a semana de um instante começa na segunda de São Paulo', () => {
    // Domingo, 15/11, 22h em São Paulo, já segunda no UTC: ainda é a semana de 09/11.
    expect(segundaDaSemana(new Date('2026-11-16T01:00:00Z'))).toBe('2026-11-09');
  });

  it('a semana vai de 0h da segunda a 0h da segunda seguinte, em São Paulo', () => {
    expect(limitesDaSemana('2026-11-09')).toEqual({
      inicio: new Date('2026-11-09T00:00:00-03:00'),
      fim: new Date('2026-11-16T00:00:00-03:00'),
    });
  });
});
