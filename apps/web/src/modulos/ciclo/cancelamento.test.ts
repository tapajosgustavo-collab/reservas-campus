import { describe, expect, it } from 'vitest';
import { msAteInicio, podeCancelar } from './cancelamento';

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
