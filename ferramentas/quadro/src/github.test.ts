import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EQUIPE } from './equipe';
import { checksExigidos, jobsDoCi, quemRevisa } from './github';

// Lê os arquivos de verdade do repositório: o teste é para avisar quando eles se desencontram.
const lerDaRaiz = (caminho: string) =>
  readFileSync(new URL(`../../../${caminho}`, import.meta.url), 'utf8');

const CODEOWNERS = lerDaRaiz('.github/CODEOWNERS');
const OS_QUATRO = EQUIPE.map((p) => p.login).sort();

const loginDe = (nome: string) => EQUIPE.find((p) => p.nome === nome)!.login;

describe('CODEOWNERS · rodízio de revisão (#14)', () => {
  // O label é "M1 conduta": a segunda palavra é a pasta do módulo na API e na tela.
  for (const responsavel of EQUIPE) {
    const pasta = responsavel.label.split(' ')[1];

    it(`${pasta} (${responsavel.nome}) pede ${responsavel.revisor}, na API e na tela`, () => {
      expect(quemRevisa(CODEOWNERS, `apps/api/src/modulos/${pasta}/nucleo/decidir.ts`)).toEqual([
        loginDe(responsavel.revisor),
      ]);
      expect(quemRevisa(CODEOWNERS, `apps/web/src/modulos/${pasta}/Tela.tsx`)).toEqual([
        loginDe(responsavel.revisor),
      ]);
    });
  }

  it.each([
    'README.md',
    'apps/api/src/app.ts',
    'apps/api/package.json',
    'package-lock.json',
    '.nvmrc',
    '.github/workflows/ci.yml',
    'packages/shared/src/index.ts',
  ])('%s pede os quatro', (arquivo) => {
    expect(quemRevisa(CODEOWNERS, arquivo).sort()).toEqual(OS_QUATRO);
  });
});

describe('Ruleset da main · checks obrigatórios (#29)', () => {
  // Um job renomeado no ci.yml sem mudar o ruleset deixa o check esperando para sempre e trava
  // todo merge na main.
  it('exige exatamente os jobs do ci.yml: lint, nucleo, api, e2e e seguranca', () => {
    const ruleset = JSON.parse(lerDaRaiz('.github/rulesets/protecao-da-main.json'));
    const jobs = jobsDoCi(lerDaRaiz('.github/workflows/ci.yml'));

    expect(jobs.sort()).toEqual(['api', 'e2e', 'lint', 'nucleo', 'seguranca']);
    expect(checksExigidos(ruleset).sort()).toEqual(jobs);
  });
});
