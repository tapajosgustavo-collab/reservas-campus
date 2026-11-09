import { describe, expect, it } from 'vitest';
import {
  corpoDaIndisponibilidade,
  periodoDaIndisponibilidade,
  resumoDaIndisponibilidade,
} from './indisponibilidade';

/** A semana exibida na agenda (segunda). */
const SEMANA = '2026-11-09';

const MANUTENCAO = {
  dataInicio: '2026-11-10',
  inicio: 8 * 60,
  dataFim: '2026-11-12',
  fim: 18 * 60,
  semFim: false,
  motivo: '  Troca do ar-condicionado ',
};

describe('US05 · Cadastrar Indisponibilidade', () => {
  it('o formulário vira instantes de São Paulo e o motivo sem espaços nas pontas', () => {
    expect(corpoDaIndisponibilidade(MANUTENCAO)).toEqual({
      inicio: '2026-11-10T08:00:00-03:00',
      fim: '2026-11-12T18:00:00-03:00',
      motivo: 'Troca do ar-condicionado',
    });
  });

  it('tirar de uso: sem previsão de volta, o fim vai vazio', () => {
    expect(corpoDaIndisponibilidade({ ...MANUTENCAO, semFim: true })).toMatchObject({
      fim: null,
    });
  });

  it.each([
    [0, 'Indisponibilidade cadastrada. Nenhuma Reserva precisou ser cancelada.'],
    [
      1,
      'Indisponibilidade cadastrada. 1 Reserva recebeu Cancelamento pelo sistema, sem Penalidade.',
    ],
    [
      3,
      'Indisponibilidade cadastrada. 3 Reservas receberam Cancelamento pelo sistema, sem Penalidade.',
    ],
  ])('%i Reservas canceladas → %s', (quantas, texto) => {
    expect(resumoDaIndisponibilidade(quantas)).toBe(texto);
  });

  it('RN04 · a agenda diz o período e o motivo da Indisponibilidade', () => {
    expect(
      periodoDaIndisponibilidade(
        {
          inicio: '2026-11-10T08:00:00-03:00',
          fim: '2026-11-12T18:00:00-03:00',
          motivo: 'Pintura',
        },
        SEMANA,
      ),
    ).toBe('Indisponível de 10/11 08:00 a 12/11 18:00: Pintura');
    expect(
      periodoDaIndisponibilidade(
        { inicio: '2026-11-13T18:00:00-03:00', fim: null, motivo: 'Fora de uso' },
        SEMANA,
      ),
    ).toBe('Indisponível a partir de 13/11 18:00, sem previsão de volta: Fora de uso');
  });

  it('RN04 · data de outro ano que o da semana exibida vem com o ano', () => {
    expect(
      periodoDaIndisponibilidade(
        { inicio: '2025-03-15T08:00:00-03:00', fim: null, motivo: 'Fora de uso' },
        SEMANA,
      ),
    ).toBe('Indisponível a partir de 15/03/2025 08:00, sem previsão de volta: Fora de uso');
    expect(
      periodoDaIndisponibilidade(
        {
          inicio: '2026-12-30T08:00:00-03:00',
          fim: '2027-01-04T08:00:00-03:00',
          motivo: 'Recesso',
        },
        '2026-12-28',
      ),
    ).toBe('Indisponível de 30/12 08:00 a 04/01/2027 08:00: Recesso');
  });
});
