// `npm run dora`: lê os Deployments de `producao`, os PRs mergeados e os commits da main pelo
// `gh` (logado na sua máquina, ou com o GITHUB_TOKEN no Actions) e escreve o relatório DORA no
// resumo do job (GITHUB_STEP_SUMMARY) ou, fora do CI, na tela. Não grava nada no repositório.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import {
  calcularDora,
  paraDeploy,
  paraPr,
  relatorioMd,
  type DeploymentDoGitHub,
  type PrDoGitHub,
} from './dora';

const REPO = process.env.GITHUB_REPOSITORY ?? 'tapajosgustavo-collab/reservas-campus';
const [DONO, NOME] = REPO.split('/') as [string, string];

const PRS = `query($dono: String!, $nome: String!, $endCursor: String) {
  repository(owner: $dono, name: $nome) {
    pullRequests(states: MERGED, baseRefName: "main", first: 100, after: $endCursor) {
      nodes {
        number title body createdAt mergedAt
        mergeCommit { oid }
        labels(first: 20) { nodes { name } }
        commits(first: 1) { nodes { commit { authoredDate } } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const DEPLOYMENTS = `query($dono: String!, $nome: String!, $endCursor: String) {
  repository(owner: $dono, name: $nome) {
    deployments(environments: ["producao"], first: 100, after: $endCursor) {
      nodes {
        databaseId commitOid createdAt description
        statuses(first: 20) { nodes { state createdAt } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

type Pagina<T> = {
  data: { repository: Record<string, { nodes: T[] }> } | null;
  errors?: { message: string }[];
};

function gh(argumentos: string[]): unknown {
  try {
    const saida = execFileSync('gh', argumentos, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    return JSON.parse(saida);
  } catch {
    console.error('Não consegui ler o GitHub. Instale o GitHub CLI e rode `gh auth login`.');
    process.exit(1);
  }
}

function consulta<T>(query: string, campo: string): T[] {
  const paginas = gh([
    'api',
    'graphql',
    '--paginate',
    '--slurp',
    '-F',
    `dono=${DONO}`,
    '-F',
    `nome=${NOME}`,
    '-f',
    `query=${query}`,
  ]) as Pagina<T>[];
  return paginas.flatMap((pagina) => {
    if (!pagina.data) {
      console.error(`A API do GitHub recusou a consulta de ${campo}:`);
      for (const erro of pagina.errors ?? []) console.error(`- ${erro.message}`);
      process.exit(1);
    }
    return pagina.data.repository[campo]?.nodes ?? [];
  });
}

// A API lista do mais novo para o mais antigo; o cálculo quer a ordem da main.
function commitsDaMain(): string[] {
  const paginas = gh([
    'api',
    `repos/${REPO}/commits?sha=main&per_page=100`,
    '--paginate',
    '--slurp',
  ]) as { sha: string }[][];
  return paginas
    .flat()
    .map((commit) => commit.sha)
    .reverse();
}

const agora = new Date().toISOString();
const deploys = consulta<DeploymentDoGitHub>(DEPLOYMENTS, 'deployments')
  .map(paraDeploy)
  .filter((deploy) => deploy !== null);
const prs = consulta<PrDoGitHub>(PRS, 'pullRequests').map(paraPr);
const md = relatorioMd(
  calcularDora({ deploys, prs, commitsDaMain: commitsDaMain(), agora }),
  agora,
);

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
else console.log(md);
