import { POLITICA } from '@reservas/shared';
import { describe, expect, it } from 'vitest';
import {
  ROTULO_DO_MOTIVO,
  rotuloDasPenalidades30d,
  rotuloDoQueConta,
  rotuloDoSuspensoAte,
} from './conduta';

describe('US02 · Minha conduta', () => {
  it('cada motivo de Penalidade tem o rótulo do glossário', () => {
    expect(ROTULO_DO_MOTIVO).toEqual({
      NaoComparecimento: 'Não comparecimento',
      CancelamentoTardio: 'Cancelamento tardio',
      DevolucaoAtrasada: 'Devolução atrasada',
    });
  });

  it.each([
    { contam: 0, texto: 'Nenhuma Penalidade conta agora para a Suspensão.' },
    {
      contam: 1,
      texto:
        '1 Penalidade conta agora para a Suspensão. Com 3 nos últimos 30 dias, você fica suspenso por 7 dias.',
    },
    {
      contam: 2,
      texto:
        '2 Penalidades contam agora para a Suspensão. Com 3 nos últimos 30 dias, você fica suspenso por 7 dias.',
    },
  ])('RN19 · $contam contando → "$texto"', ({ contam, texto }) => {
    expect(rotuloDoQueConta(contam, POLITICA)).toBe(texto);
  });

  it('RN19 · os números da frase saem da Política', () => {
    expect(
      rotuloDoQueConta(1, {
        penalidadesParaSuspensao: 5,
        janelaDePenalidadesDias: 60,
        suspensaoDias: 14,
      }),
    ).toBe(
      '1 Penalidade conta agora para a Suspensão. Com 5 nos últimos 60 dias, você fica suspenso por 14 dias.',
    );
  });
});

describe('US11 · conduta do solicitante na fila', () => {
  it('"Suspenso até DD/MM" no dia de São Paulo, mesmo perto da meia-noite', () => {
    expect(rotuloDoSuspensoAte('2026-11-11T10:15:00-03:00')).toBe('Suspenso até 11/11');
    expect(rotuloDoSuspensoAte('2026-11-12T02:30:00Z')).toBe('Suspenso até 11/11');
  });

  it.each([
    { quantas: 0, texto: null },
    { quantas: 1, texto: '1 Penalidade em 30 dias' },
    { quantas: 3, texto: '3 Penalidades em 30 dias' },
  ])('$quantas Penalidades → $texto', ({ quantas, texto }) => {
    expect(rotuloDasPenalidades30d(quantas)).toBe(texto);
  });
});
