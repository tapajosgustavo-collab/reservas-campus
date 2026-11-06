import { describe, expect, it } from 'vitest';
import {
  corpoDaReserva,
  reservaCobre,
  resumoDaCriada,
  semanaDe,
  tituloDasViolacoes,
} from './pedido';

const dasDezAoMeioDia = {
  inicio: '2026-11-10T10:00:00-03:00',
  fim: '2026-11-10T12:00:00-03:00',
};

const formulario = { data: '2026-11-10', inicio: 10 * 60, fim: 12 * 60 };

describe('US08 · Corpo do pedido de Reserva', () => {
  it('Data, Início e Fim viram instantes com o deslocamento de São Paulo', () => {
    expect(corpoDaReserva(3, formulario)).toEqual({ recursoId: 3, ...dasDezAoMeioDia });
  });

  it('Fim 24:00 é 0h do dia seguinte', () => {
    expect(corpoDaReserva(3, { ...formulario, fim: 24 * 60 }).fim).toBe(
      '2026-11-11T00:00:00-03:00',
    );
  });

  it('Participantes e Finalidade só vão preenchidos', () => {
    expect(corpoDaReserva(3, { ...formulario, participantes: 20, finalidade: ' Aula ' })).toEqual({
      recursoId: 3,
      ...dasDezAoMeioDia,
      participantes: 20,
      finalidade: 'Aula',
    });
    expect(corpoDaReserva(3, { ...formulario, finalidade: '   ' })).not.toHaveProperty(
      'finalidade',
    );
  });
});

describe('RNF09 · Violações na janela', () => {
  it.each([
    [1, 'Não foi possível reservar. 1 regra impede esta Reserva:'],
    [3, 'Não foi possível reservar. 3 regras impedem esta Reserva:'],
  ])('%i violações → título no singular ou plural', (quantas, titulo) => {
    expect(tituloDasViolacoes(quantas)).toBe(titulo);
  });
});

describe('US08 · Depois de criar', () => {
  it('RN14 · a mensagem diz a janela de Check-in, de 15 min antes a 15 min depois do início', () => {
    expect(resumoDaCriada(dasDezAoMeioDia)).toBe(
      'Reserva criada para 10/11, das 10:00 às 12:00. Faça o Check-in das 09:45 às 10:15.',
    );
  });

  it('a célula destacada é a que a Reserva cobre, sem contar a do fim', () => {
    expect(reservaCobre(dasDezAoMeioDia, '2026-11-10', 10 * 60)).toBe(true);
    expect(reservaCobre(dasDezAoMeioDia, '2026-11-10', 11 * 60 + 30)).toBe(true);
    expect(reservaCobre(dasDezAoMeioDia, '2026-11-10', 12 * 60)).toBe(false);
    expect(reservaCobre(dasDezAoMeioDia, '2026-11-11', 10 * 60)).toBe(false);
  });

  it('a agenda volta na semana da Reserva, que começa na segunda', () => {
    expect(semanaDe('2026-11-15')).toBe('2026-11-09');
    expect(semanaDe('2026-11-09')).toBe('2026-11-09');
  });
});
