// `npm run quadro`: lê as issues ready-for-human pelo `gh` já logado e reescreve a pasta quadro/.
// Só mexe em quadro/, que o .gitignore ignora: o GitHub continua sendo a fonte oficial.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EQUIPE, REPO } from './equipe';
import { arquivosDoQuadro, paraTicket, type IssueDoGitHub } from './quadro';

const PASTA = path.resolve(import.meta.dirname, '../../../quadro');

function issuesDoGitHub(): IssueDoGitHub[] {
  let saida: string;
  try {
    saida = execFileSync(
      'gh',
      [
        'api',
        `repos/${REPO}/issues?labels=ready-for-human&state=all&per_page=100`,
        '--paginate',
        '--slurp',
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
    );
  } catch {
    console.error('Não consegui ler as issues. Instale o GitHub CLI e rode `gh auth login`.');
    process.exit(1);
  }
  const paginas = JSON.parse(saida) as IssueDoGitHub[][];
  // A API de issues também devolve PRs; o quadro só quer as issues.
  return paginas.flat().filter((issue) => issue.pull_request === undefined);
}

const tickets = issuesDoGitHub().map((issue) => paraTicket(issue, EQUIPE));
const arquivos = arquivosDoQuadro(tickets, EQUIPE);

mkdirSync(PASTA, { recursive: true });
// Apaga notas que o quadro não gera mais (alguém saiu da equipe, por exemplo).
for (const nome of readdirSync(PASTA)) {
  if (/\.(md|canvas)$/.test(nome) && !arquivos.has(nome)) rmSync(path.join(PASTA, nome));
}
for (const [nome, conteudo] of arquivos) {
  writeFileSync(path.join(PASTA, nome), conteudo, 'utf8');
}

console.log(`${tickets.length} tickets. Quadro gerado em quadro/`);
