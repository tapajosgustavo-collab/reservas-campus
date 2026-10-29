import { describe, expect, it } from 'vitest';
import {
  idsCitados,
  matriz,
  matrizMd,
  regrasDosRequisitos,
  resultadosDoVitest,
  type RelatorioDoVitest,
} from './matriz';

const REQUISITOS = [
  '## 6. Regras de negócio',
  '',
  '**RN02: Intervalo válido.** O fim é depois do início.',
  '- Pedir 10h–10h → recusado.',
  '',
  '**RN01: Sem Conflito.** Uma Reserva não pode ser criada se…',
  '',
  'A RN01 também é checada no banco (texto corrido não é cabeçalho).',
  '**RN23: Equipamento ainda fora.** O Check-in…',
].join('\n');

function umRelatorio(testes: { nome: string; status: string }[]): RelatorioDoVitest {
  return {
    testResults: [
      {
        assertionResults: testes.map(({ nome, status }) => ({ fullName: nome, status })),
      },
    ],
  };
}

describe('regrasDosRequisitos', () => {
  it('lê os cabeçalhos **RNxx: Nome.** em ordem de id, sem repetir as citações no texto', () => {
    expect(regrasDosRequisitos(REQUISITOS)).toEqual([
      { id: 'RN01', nome: 'Sem Conflito' },
      { id: 'RN02', nome: 'Intervalo válido' },
      { id: 'RN23', nome: 'Equipamento ainda fora' },
    ]);
  });

  it('lê o docs/requisitos.md com CRLF (checkout no Windows sem o .gitattributes)', () => {
    expect(regrasDosRequisitos(REQUISITOS.replaceAll('\n', '\r\n'))).toHaveLength(3);
  });
});

describe('idsCitados', () => {
  it.each([
    ['RN01 · Sem Conflito existe 10h–12h, pedir 11h–13h → recusado', ['RN01']],
    ['RN07_cota_cheia_recusa', ['RN07']],
    ['RN21 · Série: cada Ocorrência passa pela RN01 e pela RN05', ['RN21', 'RN01', 'RN05']],
    ['RN01 repetida na RN01', ['RN01']],
    ['RNF11 · requisições simultâneas', []],
    ['GET /api/health responde ok', []],
    ['XRN01 não é citação', []],
    ['RN012 tem três dígitos', []],
  ])('%s → %j', (nome, ids) => {
    expect(idsCitados(nome)).toEqual(ids);
  });
});

describe('resultadosDoVitest', () => {
  it('junta os testes de todos os arquivos do relatório JSON', () => {
    const relatorio: RelatorioDoVitest = {
      testResults: [
        { assertionResults: [{ fullName: 'RN01 · a', status: 'passed' }] },
        { assertionResults: [{ fullName: 'RN02 · b', status: 'failed' }] },
      ],
    };

    expect(resultadosDoVitest(relatorio)).toEqual([
      { nome: 'RN01 · a', status: 'passou' },
      { nome: 'RN02 · b', status: 'falhou' },
    ]);
  });

  it.each([
    ['skipped', 'pulado'],
    ['pending', 'pulado'],
    ['todo', 'pulado'],
  ])('status %s conta como %s', (status, esperado) => {
    expect(resultadosDoVitest(umRelatorio([{ nome: 'RN01', status }]))[0]?.status).toBe(esperado);
  });
});

describe('matriz', () => {
  const regras = regrasDosRequisitos(REQUISITOS);

  it('conta, por RN, os testes que passaram, falharam e foram pulados', () => {
    const resultados = resultadosDoVitest(
      umRelatorio([
        { nome: 'RN01 · Sem Conflito existe 10h–12h, pedir 11h–13h → recusado', status: 'passed' },
        { nome: 'RN01 · Sem Conflito só se encostam → aceita', status: 'passed' },
        { nome: 'RN02 · Intervalo válido fim antes do início', status: 'failed' },
        { nome: 'RN02 · Intervalo válido meia hora quebrada', status: 'skipped' },
      ]),
    );

    expect(matriz(regras, resultados)).toEqual({
      linhas: [
        { id: 'RN01', nome: 'Sem Conflito', passaram: 2, falharam: 0, pulados: 0 },
        { id: 'RN02', nome: 'Intervalo válido', passaram: 0, falharam: 1, pulados: 1 },
        { id: 'RN23', nome: 'Equipamento ainda fora', passaram: 0, falharam: 0, pulados: 0 },
      ],
      desconhecidas: [],
    });
  });

  it('um teste que cita duas RNs conta nas duas', () => {
    const resultados = resultadosDoVitest(
      umRelatorio([{ nome: 'RN01 e RN02 juntas', status: 'passed' }]),
    );

    const { linhas } = matriz(regras, resultados);

    expect(linhas.map((l) => l.passaram)).toEqual([1, 1, 0]);
  });

  it('RN citada num teste que não está nos requisitos aparece à parte', () => {
    const resultados = resultadosDoVitest(
      umRelatorio([{ nome: 'RN99 · Regra de teste', status: 'passed' }]),
    );

    expect(matriz(regras, resultados).desconhecidas).toEqual(['RN99']);
  });
});

describe('matrizMd', () => {
  const regras = regrasDosRequisitos(REQUISITOS);

  it('monta a tabela com a situação de cada RN e o total com teste passando', () => {
    const resultados = resultadosDoVitest(
      umRelatorio([
        { nome: 'RN01 · a', status: 'passed' },
        { nome: 'RN02 · b', status: 'failed' },
      ]),
    );

    expect(matrizMd('núcleo', matriz(regras, resultados))).toBe(
      [
        '## Matriz RN → testes (núcleo)',
        '',
        '1 de 3 RNs com teste passando.',
        '',
        '| RN | Regra | Situação | Passaram | Falharam | Pulados |',
        '|---|---|---|---:|---:|---:|',
        '| RN01 | Sem Conflito | ✅ passando | 1 | 0 | 0 |',
        '| RN02 | Intervalo válido | ❌ falhando | 0 | 1 | 0 |',
        '| RN23 | Equipamento ainda fora | ➖ sem teste | 0 | 0 | 0 |',
        '',
      ].join('\n'),
    );
  });

  it('só pulados é "pulado", não "passando"', () => {
    const resultados = resultadosDoVitest(umRelatorio([{ nome: 'RN01 · a', status: 'skipped' }]));

    expect(matrizMd('api', matriz(regras, resultados))).toContain(
      '| RN01 | Sem Conflito | ⏭️ só pulados | 0 | 0 | 1 |',
    );
  });

  it('avisa das RNs citadas que não existem nos requisitos', () => {
    const resultados = resultadosDoVitest(umRelatorio([{ nome: 'RN99 · a', status: 'passed' }]));

    expect(matrizMd('api', matriz(regras, resultados))).toContain(
      '⚠️ Testes citam RNs que não estão no `docs/requisitos.md`: RN99.',
    );
  });
});
