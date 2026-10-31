// `npm run matriz -- --suite núcleo resultados.json`: lê o relatório JSON do Vitest e escreve a
// matriz RN → testes no resumo do job (GITHUB_STEP_SUMMARY) ou, fora do CI, na tela.
// Não bloqueia nada: quem falha o CI são os testes e a cobertura, não a matriz.

import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { matriz, matrizMd, regrasDosRequisitos, resultadosDoVitest } from './matriz';

const { values, positionals } = parseArgs({
  options: { suite: { type: 'string', default: 'testes' } },
  allowPositionals: true,
});
if (positionals.length === 0) {
  console.error('Uso: npm run matriz -- --suite <nome> <resultados.json>...');
  process.exit(1);
}

// O npm roda o script na pasta do workspace; os caminhos vêm de onde ele foi chamado.
const daqui = (arquivo: string) => path.resolve(process.env.INIT_CWD ?? process.cwd(), arquivo);
const requisitos = readFileSync(
  path.resolve(import.meta.dirname, '../../../docs/requisitos.md'),
  'utf8',
);

const resultados = positionals.flatMap((arquivo) =>
  resultadosDoVitest(JSON.parse(readFileSync(daqui(arquivo), 'utf8'))),
);
const md = matrizMd(values.suite, matriz(regrasDosRequisitos(requisitos), resultados));

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
else console.log(md);
