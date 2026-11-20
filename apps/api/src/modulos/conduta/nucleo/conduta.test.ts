import { POLITICA } from '@reservas/shared';
import { describe, expect, it } from 'vitest';
import { condutaDoUsuario, penalidadesNaJanela } from './conduta';

/** Em São Paulo, em outubro e novembro de 2026. */
const em = (mesDiaHora: string) => new Date(`2026-${mesDiaHora}:00-03:00`);

/** Uma Penalidade do histórico; `suspensaoId` preenchido = já causou Suspensão (RN20). */
const umaPenalidade = (id: number, quando: string, suspensaoId: number | null = null) => ({
  id,
  em: em(quando),
  suspensaoId,
  motivo: 'NaoComparecimento' as const,
});

describe('US02 · Minha conduta', () => {
  it('US02_sem Penalidade nem Suspensão → não está suspenso e nada conta', () => {
    expect(
      condutaDoUsuario({ penalidades: [], suspensoes: [], politica: POLITICA }, em('11-10T08:00')),
    ).toEqual({ suspensoAte: null, penalidadesQueContam: 0, penalidades: [] });
  });

  it('US02_cada Penalidade vem com os dados dela e se ainda conta para a Suspensão', () => {
    const conduta = condutaDoUsuario(
      { penalidades: [umaPenalidade(7, '11-05T10:15')], suspensoes: [], politica: POLITICA },
      em('11-10T08:00'),
    );

    expect(conduta.penalidades).toEqual([
      {
        id: 7,
        em: em('11-05T10:15'),
        suspensaoId: null,
        motivo: 'NaoComparecimento',
        contaParaSuspensao: true,
      },
    ]);
    expect(conduta.penalidadesQueContam).toBe(1);
  });

  it('US02_com Suspensão em vigor → suspensoAte é o fim dela; depois do fim, null', () => {
    const fatos = {
      penalidades: [],
      suspensoes: [{ inicio: em('11-04T10:15'), fim: em('11-11T10:15') }],
      politica: POLITICA,
    };

    expect(condutaDoUsuario(fatos, em('11-10T08:00')).suspensoAte).toEqual(em('11-11T10:15'));
    expect(condutaDoUsuario(fatos, em('11-11T10:15')).suspensoAte).toBeNull();
  });

  it('RN20_as Penalidades que já causaram uma Suspensão continuam no histórico, mas não contam mais', () => {
    const conduta = condutaDoUsuario(
      {
        penalidades: [
          umaPenalidade(4, '11-09T10:15'),
          umaPenalidade(3, '11-04T10:15', 1),
          umaPenalidade(2, '11-03T10:15', 1),
          umaPenalidade(1, '11-02T10:15', 1),
        ],
        suspensoes: [{ inicio: em('11-04T10:15'), fim: em('11-11T10:15') }],
        politica: POLITICA,
      },
      em('11-10T08:00'),
    );

    expect(
      conduta.penalidades.map(({ id, contaParaSuspensao }) => [id, contaParaSuspensao]),
    ).toEqual([
      [4, true],
      [3, false],
      [2, false],
      [1, false],
    ]);
    expect(conduta.penalidadesQueContam).toBe(1);
  });

  it('RN19_janela móvel: a Penalidade de 30 dias antes do agora já não conta, a de 1 minuto depois conta', () => {
    const conduta = condutaDoUsuario(
      {
        penalidades: [umaPenalidade(2, '10-11T08:01'), umaPenalidade(1, '10-11T08:00')],
        suspensoes: [],
        politica: POLITICA,
      },
      em('11-10T08:00'),
    );

    expect(
      conduta.penalidades.map(({ id, contaParaSuspensao }) => [id, contaParaSuspensao]),
    ).toEqual([
      [2, true],
      [1, false],
    ]);
    expect(conduta.penalidadesQueContam).toBe(1);
  });

  it('RN19_a janela sai da Política: com 3 dias, a Penalidade de 5 dias atrás não conta', () => {
    const politica = { ...POLITICA, janelaDePenalidadesDias: 3 };

    expect(
      condutaDoUsuario(
        { penalidades: [umaPenalidade(1, '11-05T08:00')], suspensoes: [], politica },
        em('11-10T08:00'),
      ).penalidadesQueContam,
    ).toBe(0);
  });
});

describe('US11 · Penalidades do solicitante na fila', () => {
  it('US11_conta todas as Penalidades dos últimos 30 dias, também as que já causaram Suspensão', () => {
    const penalidades = [
      umaPenalidade(4, '11-09T10:15'),
      umaPenalidade(3, '11-04T10:15', 1),
      umaPenalidade(2, '10-11T08:01', 1),
      // Exatamente 30 dias antes do agora: fora da janela.
      umaPenalidade(1, '10-11T08:00'),
    ];

    expect(penalidadesNaJanela(penalidades, em('11-10T08:00'), POLITICA)).toBe(3);
  });

  it('US11_sem Penalidade na janela → 0', () => {
    expect(
      penalidadesNaJanela([umaPenalidade(1, '09-01T10:15')], em('11-10T08:00'), POLITICA),
    ).toBe(0);
  });
});
