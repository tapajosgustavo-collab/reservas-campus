import { describe, expect, it } from 'vitest';
import { checkInAberto, janelaDoCheckIn, msAteMudarOBotao } from './check-in';

/** A Reserva Confirmada das 10h de terça, 10/11/2026. */
const dasDez = { status: 'Confirmada', inicio: '2026-11-10T10:00:00-03:00' } as const;

/** O `agora` da API às `hora` da mesma terça. */
const as = (hora: string) => `2026-11-10T${hora}:00-03:00`;

describe('RN14 · Botão de Check-in só na janela', () => {
  it.each([
    ['09:40', false],
    ['09:45', true],
    ['09:50', true],
    ['10:14', true],
    ['10:15', false],
    ['10:16', false],
  ])('Reserva às 10h, agora %s → botão %s', (hora, aparece) => {
    expect(checkInAberto(dasDez, as(hora))).toBe(aparece);
  });

  it('o agora da API vale com qualquer deslocamento: 12h50 em UTC são 9h50 em São Paulo', () => {
    expect(checkInAberto(dasDez, '2026-11-10T12:50:00Z')).toBe(true);
  });

  it.each(['Pendente', 'EmUso', 'Cancelada', 'NaoComparecimento'] as const)(
    'Reserva %s, na janela → sem botão',
    (status) => {
      expect(checkInAberto({ ...dasDez, status }, as('09:50'))).toBe(false);
    },
  );
});

describe('RN14 · Janela de Check-in na tela', () => {
  it('Reserva às 10h → de 9h45 a 10h15, pela Política', () => {
    expect(janelaDoCheckIn('2026-11-10T10:00:00-03:00')).toEqual({
      abre: Date.parse('2026-11-10T09:45:00-03:00'),
      fecha: Date.parse('2026-11-10T10:15:00-03:00'),
    });
  });
});

describe('RN14 · O botão acompanha a janela sem recarregar a tela', () => {
  const MINUTO = 60_000;

  it('antes da janela: consultar o agora da API de novo quando ela abre (5 min)', () => {
    expect(msAteMudarOBotao(dasDez, as('09:40'))).toBe(5 * MINUTO);
  });

  it('na janela: consultar de novo quando ela fecha (25 min)', () => {
    expect(msAteMudarOBotao(dasDez, as('09:50'))).toBe(25 * MINUTO);
  });

  it('depois da janela: nada mais a esperar', () => {
    expect(msAteMudarOBotao(dasDez, as('10:15'))).toBeNull();
  });

  it('Reserva que não está Confirmada: nada a esperar', () => {
    expect(msAteMudarOBotao({ ...dasDez, status: 'Pendente' }, as('09:40'))).toBeNull();
  });
});
