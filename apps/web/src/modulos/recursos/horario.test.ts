import { describe, expect, it } from 'vitest';
import { horariosDasLinhas, linhasDoHorario, rotuloDoMinuto } from './horario';

describe('US04 · Horário de funcionamento na tela', () => {
  it.each([
    [0, '00:00'],
    [7 * 60 + 30, '07:30'],
    [23 * 60, '23:00'],
    [24 * 60, '24:00'],
  ])('%i minutos → %s', (minutos, rotulo) => {
    expect(rotuloDoMinuto(minutos)).toBe(rotulo);
  });

  it('as sete linhas vêm de domingo a sábado, e dia sem faixa fica fechado', () => {
    const linhas = linhasDoHorario([{ diaSemana: 1, abre: 480, fecha: 720 }]);

    expect(linhas).toHaveLength(7);
    expect(linhas[0]).toMatchObject({ diaSemana: 0, aberto: false });
    expect(linhas[1]).toEqual({ diaSemana: 1, aberto: true, abre: 480, fecha: 720 });
  });

  it('só os dias abertos viram faixas, na ordem da semana', () => {
    const linhas = linhasDoHorario([
      { diaSemana: 5, abre: 480, fecha: 720 },
      { diaSemana: 1, abre: 420, fecha: 1380 },
    ]);

    expect(horariosDasLinhas(linhas)).toEqual([
      { diaSemana: 1, abre: 420, fecha: 1380 },
      { diaSemana: 5, abre: 480, fecha: 720 },
    ]);
  });
});
