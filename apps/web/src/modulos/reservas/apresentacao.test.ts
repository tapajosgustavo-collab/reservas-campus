import { describe, expect, it } from 'vitest';
import {
  paginasDe,
  rotuloDaTransicao,
  rotuloDoInstante,
  rotuloDoIntervalo,
  ROTULO_DO_STATUS,
} from './apresentacao';

describe('US10 · Minhas reservas na tela', () => {
  it('o Status aparece com o nome do glossário, com acento', () => {
    expect(ROTULO_DO_STATUS.EmUso).toBe('Em uso');
    expect(ROTULO_DO_STATUS.Concluida).toBe('Concluída');
    expect(ROTULO_DO_STATUS.NaoComparecimento).toBe('Não comparecimento');
  });

  it('o Intervalo sai no horário de São Paulo, mesmo com a entrada em UTC', () => {
    expect(rotuloDoIntervalo('2026-11-11T01:00:00Z', '2026-11-11T02:00:00Z')).toBe(
      '10/11/2026, das 22:00 às 23:00',
    );
  });

  it('o instante do histórico sai no horário de São Paulo', () => {
    expect(rotuloDoInstante('2026-11-11T01:30:00Z')).toBe('10/11/2026 às 22:30');
  });

  it('a primeira transição diz como a Reserva nasceu', () => {
    expect(rotuloDaTransicao({ de: null, para: 'Confirmada' })).toBe('Criada como Confirmada');
  });

  it('as demais dizem de qual Status para qual', () => {
    expect(rotuloDaTransicao({ de: 'Confirmada', para: 'EmUso' })).toBe('Confirmada → Em uso');
  });

  it.each([
    [0, 1],
    [20, 1],
    [21, 2],
    [40, 2],
    [41, 3],
  ])('%i Reservas com 20 por página → %i páginas', (total, paginas) => {
    expect(paginasDe(total, 20)).toBe(paginas);
  });
});
