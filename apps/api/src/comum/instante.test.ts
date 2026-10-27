import { describe, expect, it } from 'vitest';
import { paraIsoSaoPaulo } from './instante';

describe('RNF08 · Instantes no horário de São Paulo', () => {
  it('sai em ISO 8601 com o deslocamento de São Paulo', () => {
    expect(paraIsoSaoPaulo(new Date('2026-11-10T11:00:00Z'))).toBe('2026-11-10T08:00:00-03:00');
  });

  it('a virada do dia é a de São Paulo, não a do UTC', () => {
    expect(paraIsoSaoPaulo(new Date('2026-11-11T01:30:00Z'))).toBe('2026-11-10T22:30:00-03:00');
  });
});
