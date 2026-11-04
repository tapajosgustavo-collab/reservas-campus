import type { Horario } from '@reservas/shared';
import { describe, expect, it } from 'vitest';
import { livreNoIntervalo, type ReservaNaBusca } from './busca';

/** Terça, das 7h às 23h. */
const TERCA: Horario = { diaSemana: 2, abre: 7 * 60, fecha: 23 * 60 };

/** `'10:00'` na terça, 10/11/2026, em São Paulo. */
function terca(hora: string) {
  return new Date(`2026-11-10T${hora}:00-03:00`);
}

function intervalo(de: string, ate: string) {
  return { inicio: terca(de), fim: terca(ate) };
}

function reserva(de: string, ate: string, dados: Partial<ReservaNaBusca> = {}): ReservaNaBusca {
  return { ...intervalo(de, ate), status: 'Confirmada', ...dados };
}

function livre(busca: { inicio: Date; fim: Date }, reservas: ReservaNaBusca[] = []) {
  return livreNoIntervalo({ horarios: [TERCA], reservas }, busca);
}

describe('RN01 · Sem Conflito na busca', () => {
  it('RN01 · existe 10h–12h, buscar 11h–13h → some', () => {
    expect(livre(intervalo('11:00', '13:00'), [reserva('10:00', '12:00')])).toBe(false);
  });

  it('RN01 · existe 10h–12h Cancelada, buscar 10h–12h → aparece', () => {
    expect(
      livre(intervalo('10:00', '12:00'), [reserva('10:00', '12:00', { status: 'Cancelada' })]),
    ).toBe(true);
  });

  it('RN01 · existe 10h–12h, buscar 12h–14h (só encosta) → aparece', () => {
    expect(livre(intervalo('12:00', '14:00'), [reserva('10:00', '12:00')])).toBe(true);
  });
});

describe('RN03 · Dentro do Horário de funcionamento na busca', () => {
  it('RN03 · abre 7h–23h, buscar 22h–23h30 → some', () => {
    expect(livre(intervalo('22:00', '23:30'))).toBe(false);
  });

  it('RN03 · abre 7h–23h, buscar 21h–23h (até o fechamento) → aparece', () => {
    expect(livre(intervalo('21:00', '23:00'))).toBe(true);
  });

  it('RN03 · fechado na quarta, buscar quarta 10h–12h → some', () => {
    const quarta = {
      inicio: new Date('2026-11-11T10:00:00-03:00'),
      fim: new Date('2026-11-11T12:00:00-03:00'),
    };
    expect(livre(quarta)).toBe(false);
  });
});

describe('RN02 · Intervalo válido na busca', () => {
  it('RN02 · buscar das 12h às 10h (fim antes do início) → nada aparece', () => {
    expect(livre(intervalo('12:00', '10:00'))).toBe(false);
  });

  it('RN02 · aberto terça e quarta o dia todo, buscar terça 23h–quarta 1h → some', () => {
    const diaTodo = [2, 3].map((diaSemana) => ({ diaSemana, abre: 0, fecha: 24 * 60 }));
    const virada = { inicio: terca('23:00'), fim: new Date('2026-11-11T01:00:00-03:00') };
    expect(livreNoIntervalo({ horarios: diaTodo, reservas: [] }, virada)).toBe(false);
  });

  it('RN02 · aberto até 24h, buscar 23h–0h do dia seguinte (meia-noite) → aparece', () => {
    const ateMeiaNoite = [{ diaSemana: 2, abre: 22 * 60, fecha: 24 * 60 }];
    const ultimaHora = { inicio: terca('23:00'), fim: new Date('2026-11-11T00:00:00-03:00') };
    expect(livreNoIntervalo({ horarios: ateMeiaNoite, reservas: [] }, ultimaHora)).toBe(true);
  });
});
