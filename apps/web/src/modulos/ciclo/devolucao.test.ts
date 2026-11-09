import { describe, expect, it } from 'vitest';
import { corpoDaDevolucao, podeConfirmarDevolucao } from './devolucao';

describe('US14 · Formulário de Devolução na tela', () => {
  it('sem perda ou roubo: observação é opcional e pode confirmar em branco', () => {
    expect(podeConfirmarDevolucao({ observacao: '', extraviado: false })).toBe(true);
    expect(corpoDaDevolucao({ observacao: '   ', extraviado: false })).toEqual({});
  });

  it('com observação preenchida: envia sem espaços nas pontas', () => {
    expect(
      corpoDaDevolucao({ observacao: '  Devolvido com o cabo HDMI.  ', extraviado: false }),
    ).toEqual({
      observacao: 'Devolvido com o cabo HDMI.',
    });
  });

  it('RN17 · Equipamento perdido ou roubado: exige observação antes de confirmar', () => {
    expect(podeConfirmarDevolucao({ observacao: '', extraviado: true })).toBe(false);
    expect(podeConfirmarDevolucao({ observacao: '   ', extraviado: true })).toBe(false);
    expect(podeConfirmarDevolucao({ observacao: 'Furtado no ponto.', extraviado: true })).toBe(
      true,
    );
  });

  it('RN17 · Equipamento perdido ou roubado: envia extraviado e a observação', () => {
    expect(
      corpoDaDevolucao({ observacao: '  Furtado no ponto de ônibus. ', extraviado: true }),
    ).toEqual({
      observacao: 'Furtado no ponto de ônibus.',
      extraviado: true,
    });
  });
});
