import { POLITICA } from '@reservas/shared';
import { describe, expect, it } from 'vitest';
import { suspensaoPelaPenalidade, suspensoAte, type PenalidadeDoHistorico } from './suspensao';

/** Em São Paulo, em novembro e dezembro de 2026. */
const em = (mesDiaHora: string) => new Date(`2026-${mesDiaHora}:00-03:00`);

const umaPenalidade = (
  id: number,
  quando: string,
  suspensaoId: number | null = null,
): PenalidadeDoHistorico => ({ id, em: em(quando), suspensaoId });

describe('RN19 · Suspensão', () => {
  it('RN19_3ª Penalidade nos últimos 30 dias → Suspensão de 7 dias a partir dela, contando as 3', () => {
    const historico = [umaPenalidade(1, '11-02T10:15'), umaPenalidade(2, '11-03T10:15')];

    expect(suspensaoPelaPenalidade({ em: em('11-04T10:15') }, historico, POLITICA)).toEqual({
      inicio: em('11-04T10:15'),
      fim: em('11-11T10:15'),
      penalidadeIds: [1, 2],
    });
  });

  it('RN19_2ª Penalidade nos últimos 30 dias → sem Suspensão', () => {
    const historico = [umaPenalidade(1, '11-02T10:15')];

    expect(suspensaoPelaPenalidade({ em: em('11-04T10:15') }, historico, POLITICA)).toBeNull();
  });

  it('RN19_janela móvel: a Penalidade de 30 dias antes da nova já não conta', () => {
    const historico = [umaPenalidade(1, '11-01T10:15'), umaPenalidade(2, '11-20T10:15')];

    expect(suspensaoPelaPenalidade({ em: em('12-01T10:15') }, historico, POLITICA)).toBeNull();
    expect(suspensaoPelaPenalidade({ em: em('12-01T10:14') }, historico, POLITICA)).toEqual({
      inicio: em('12-01T10:14'),
      fim: em('12-08T10:14'),
      penalidadeIds: [1, 2],
    });
  });

  it('RN19_Penalidades recebidas durante a Suspensão contam: suspenso de 01/11 a 08/11, faltas em 02, 03 e 04/11 → nova Suspensão até 11/11', () => {
    const historico = [
      umaPenalidade(1, '10-29T10:15', 1),
      umaPenalidade(2, '10-31T10:15', 1),
      umaPenalidade(3, '11-01T10:15', 1),
      umaPenalidade(4, '11-02T10:15'),
      umaPenalidade(5, '11-03T10:15'),
    ];

    expect(suspensaoPelaPenalidade({ em: em('11-04T10:15') }, historico, POLITICA)).toEqual({
      inicio: em('11-04T10:15'),
      fim: em('11-11T10:15'),
      penalidadeIds: [4, 5],
    });
  });

  it('RN19_a Política define quantas Penalidades, em quantos dias, suspendem por quanto tempo', () => {
    const politica = { penalidadesParaSuspensao: 2, janelaDePenalidadesDias: 3, suspensaoDias: 1 };

    expect(
      suspensaoPelaPenalidade(
        { em: em('11-04T10:15') },
        [umaPenalidade(1, '11-02T10:15')],
        politica,
      ),
    ).toEqual({ inicio: em('11-04T10:15'), fim: em('11-05T10:15'), penalidadeIds: [1] });
  });
});

describe('RN20 · Penalidade conta uma vez', () => {
  it('RN20_suspenso pelas 3 primeiras, a 4ª Penalidade dentro dos mesmos 30 dias não suspende de novo', () => {
    const historico = [
      umaPenalidade(1, '11-02T10:15', 9),
      umaPenalidade(2, '11-03T10:15', 9),
      umaPenalidade(3, '11-04T10:15', 9),
    ];

    expect(suspensaoPelaPenalidade({ em: em('11-12T10:15') }, historico, POLITICA)).toBeNull();
  });
});

describe('RN09 · Suspenso não reserva: quando a Suspensão está em vigor', () => {
  const suspensao = { inicio: em('11-04T10:15'), fim: em('11-11T10:15') };

  it('RN09_em vigor é inicio <= agora < fim', () => {
    expect(suspensoAte([suspensao], em('11-04T10:14'))).toBeNull();
    expect(suspensoAte([suspensao], em('11-04T10:15'))).toEqual(em('11-11T10:15'));
    expect(suspensoAte([suspensao], em('11-11T10:14'))).toEqual(em('11-11T10:15'));
    expect(suspensoAte([suspensao], em('11-11T10:15'))).toBeNull();
  });

  it('RN09_com duas Suspensões em vigor, o fim efetivo é o maior fim', () => {
    const primeira = { inicio: em('11-01T10:15'), fim: em('11-08T10:15') };

    expect(suspensoAte([suspensao, primeira], em('11-05T09:00'))).toEqual(em('11-11T10:15'));
  });

  it('RN09_sem Suspensão → não está suspenso', () => {
    expect(suspensoAte([], em('11-05T09:00'))).toBeNull();
  });
});
