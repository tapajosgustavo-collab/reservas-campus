import type { Ocupacao } from '@reservas/shared';
import { describe, expect, it } from 'vitest';
import {
  celulaDaGrade,
  diasDaGrade,
  estadoDaCelula,
  intervaloDoArraste,
  intervaloDoClique,
  linhasDaGrade,
  semanaVizinha,
  type DiaDaGrade,
} from './grade';

const SEG_A_SEX_7H_23H = [1, 2, 3, 4, 5].map((diaSemana) => ({
  diaSemana,
  abre: 7 * 60,
  fecha: 23 * 60,
}));

/** Terça, 10/11/2026, das 7h às 23h. */
const terca: DiaDaGrade = { data: '2026-11-10', diaSemana: 2, abre: 7 * 60, fecha: 23 * 60 };

const agora = new Date('2026-11-10T08:00:00-03:00');

const dasDezAoMeioDia: Ocupacao = {
  inicio: '2026-11-10T10:00:00-03:00',
  fim: '2026-11-10T12:00:00-03:00',
};

describe('US07 · Grade semanal da agenda', () => {
  it('só os dias em que o Recurso abre, a partir da segunda', () => {
    const dias = diasDaGrade('2026-11-09', [
      { diaSemana: 6, abre: 8 * 60, fecha: 12 * 60 },
      { diaSemana: 1, abre: 7 * 60, fecha: 23 * 60 },
    ]);

    expect(dias).toEqual([
      { data: '2026-11-09', diaSemana: 1, abre: 7 * 60, fecha: 23 * 60 },
      { data: '2026-11-14', diaSemana: 6, abre: 8 * 60, fecha: 12 * 60 },
    ]);
  });

  it('o domingo é o último dia da semana', () => {
    expect(diasDaGrade('2026-11-09', [{ diaSemana: 0, abre: 0, fecha: 60 }])).toEqual([
      { data: '2026-11-15', diaSemana: 0, abre: 0, fecha: 60 },
    ]);
  });

  it('as linhas vão de meia em meia hora, da primeira abertura ao último fechamento', () => {
    const dias = diasDaGrade('2026-11-09', [
      { diaSemana: 1, abre: 8 * 60, fecha: 10 * 60 },
      { diaSemana: 2, abre: 9 * 60, fecha: 11 * 60 },
    ]);

    expect(linhasDaGrade(dias)).toEqual([480, 510, 540, 570, 600, 630]);
  });

  it('semana anterior e seguinte', () => {
    expect(semanaVizinha('2026-11-09', -1)).toBe('2026-11-02');
    expect(semanaVizinha('2026-11-30', 1)).toBe('2026-12-07');
  });

  it.each([
    [6 * 60 + 30, 'fechado'],
    [23 * 60, 'fechado'],
    [7 * 60, 'passado'],
    [7 * 60 + 30, 'passado'],
    [8 * 60, 'livre'],
    [10 * 60, 'ocupado'],
    [11 * 60 + 30, 'ocupado'],
    [12 * 60, 'livre'],
  ] as const)(
    'terça às %i minutos, com agora às 8h e outra pessoa das 10h às 12h → %s',
    (minuto, estado) => {
      expect(estadoDaCelula(terca, minuto, [dasDezAoMeioDia], agora)).toBe(estado);
    },
  );

  it('Sua reserva: Confirmada e Pendente são estados diferentes', () => {
    const minha = { ...dasDezAoMeioDia, minha: true, reservaId: 1 } as const;

    expect(estadoDaCelula(terca, 10 * 60, [{ ...minha, status: 'Confirmada' }], agora)).toBe(
      'minha-confirmada',
    );
    expect(estadoDaCelula(terca, 10 * 60, [{ ...minha, status: 'Pendente' }], agora)).toBe(
      'minha-pendente',
    );
  });

  it('Reserva que já passou continua aparecendo como ocupada', () => {
    const cedo = { inicio: '2026-11-10T07:00:00-03:00', fim: '2026-11-10T08:00:00-03:00' };

    expect(estadoDaCelula(terca, 7 * 60, [cedo], agora)).toBe('ocupado');
  });

  it('a célula traz o estado e a Ocupação que a ocupa, para a tela não procurar de novo', () => {
    expect(celulaDaGrade(terca, 10 * 60, [dasDezAoMeioDia], agora)).toEqual({
      estado: 'ocupado',
      ocupacao: dasDezAoMeioDia,
    });
    expect(celulaDaGrade(terca, 9 * 60, [dasDezAoMeioDia], agora)).toEqual({
      estado: 'livre',
      ocupacao: undefined,
    });
  });

  it('clique num horário livre → 1h', () => {
    expect(intervaloDoClique(terca, 8 * 60, [dasDezAoMeioDia], agora)).toEqual({
      data: '2026-11-10',
      inicio: 8 * 60,
      fim: 9 * 60,
    });
  });

  it('clique na última meia hora livre antes de uma Reserva → 30 min', () => {
    expect(intervaloDoClique(terca, 9 * 60 + 30, [dasDezAoMeioDia], agora)).toEqual({
      data: '2026-11-10',
      inicio: 9 * 60 + 30,
      fim: 10 * 60,
    });
  });

  it('clique na última meia hora antes de fechar → 30 min', () => {
    expect(intervaloDoClique(terca, 22 * 60 + 30, [], agora)).toMatchObject({ fim: 23 * 60 });
  });

  it('RN04 · célula dentro de uma Indisponibilidade é Indisponível, mesmo sem fim', () => {
    const pintura = {
      inicio: '2026-11-10T14:00:00-03:00',
      fim: '2026-11-10T16:00:00-03:00',
      motivo: 'Pintura',
    };
    const foraDeUso = { inicio: '2026-11-10T20:00:00-03:00', fim: null, motivo: 'Fora de uso' };

    expect(estadoDaCelula(terca, 15 * 60, [], agora, [pintura])).toBe('indisponivel');
    expect(estadoDaCelula(terca, 16 * 60, [], agora, [pintura])).toBe('livre');
    expect(estadoDaCelula(terca, 22 * 60, [], agora, [foraDeUso])).toBe('indisponivel');
  });

  it('RN04 · clique antes de uma Indisponibilidade escolhe só 30 min', () => {
    const pintura = { inicio: '2026-11-10T14:00:00-03:00', fim: null, motivo: 'Pintura' };

    expect(intervaloDoClique(terca, 13 * 60 + 30, [], agora, [pintura])).toMatchObject({
      fim: 14 * 60,
    });
  });

  it('arrastar escolhe o Intervalo das duas células, em qualquer direção', () => {
    const esperado = { data: '2026-11-10', inicio: 13 * 60, fim: 15 * 60 + 30 };

    expect(intervaloDoArraste(terca, 13 * 60, 15 * 60)).toEqual(esperado);
    expect(intervaloDoArraste(terca, 15 * 60, 13 * 60)).toEqual(esperado);
  });

  it('RN04 · arrastar não entra na Indisponibilidade nem a atravessa, nas duas direções', () => {
    const dasDezAsOnze = {
      inicio: '2026-11-10T10:00:00-03:00',
      fim: '2026-11-10T11:00:00-03:00',
      motivo: 'Pintura',
    };

    expect(intervaloDoArraste(terca, 9 * 60 + 30, 11 * 60, [dasDezAsOnze])).toEqual({
      data: '2026-11-10',
      inicio: 9 * 60 + 30,
      fim: 10 * 60,
    });
    expect(intervaloDoArraste(terca, 12 * 60, 9 * 60, [dasDezAsOnze])).toEqual({
      data: '2026-11-10',
      inicio: 11 * 60,
      fim: 12 * 60 + 30,
    });
  });

  it('a grade de uma semana sem Horário de funcionamento não tem dias nem linhas', () => {
    const dias = diasDaGrade('2026-11-09', []);

    expect(dias).toEqual([]);
    expect(linhasDaGrade(dias)).toEqual([]);
  });

  it('SEG_A_SEX_7H_23H mostra cinco dias e 32 linhas', () => {
    const dias = diasDaGrade('2026-11-09', SEG_A_SEX_7H_23H);

    expect(dias.map(({ data }) => data)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
    ]);
    expect(linhasDaGrade(dias)).toHaveLength(32);
  });
});
