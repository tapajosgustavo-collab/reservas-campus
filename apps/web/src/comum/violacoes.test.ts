import { describe, expect, it } from 'vitest';
import { linhaDaViolacao } from './violacoes';

describe('RNF09 · Violações na tela', () => {
  it('uma linha no formato RNxx · Nome: mensagem', () => {
    const violacao = { rn: 'RN01', nome: 'Sem Conflito', mensagem: 'Ocupado das 10:00 às 12:00.' };

    expect(linhaDaViolacao(violacao)).toBe('RN01 · Sem Conflito: Ocupado das 10:00 às 12:00.');
  });
});
