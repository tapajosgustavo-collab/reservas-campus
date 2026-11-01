// Calcula as métricas DORA (ticket #15) e monta o relatório, sem I/O: quem lê o GitHub e
// escreve no resumo do Actions é o gerar.ts.

/** Um Deployment do ambiente `producao` como vem da API GraphQL, só com o que o relatório usa. */
export type DeploymentDoGitHub = {
  databaseId: number;
  commitOid: string;
  createdAt: string;
  description: string | null;
  statuses: { nodes: { state: string; createdAt: string }[] };
};

/** Um PR mergeado na main como vem da API GraphQL. */
export type PrDoGitHub = {
  number: number;
  title: string;
  body: string;
  createdAt: string;
  mergedAt: string;
  mergeCommit: { oid: string } | null;
  labels: { nodes: { name: string }[] };
  /** Só o primeiro commit do PR. */
  commits: { nodes: { commit: { authoredDate: string } }[] };
};

export type Deploy = { id: number; sha: string; resultado: 'sucesso' | 'falha'; em: string };

export type Pr = {
  numero: number;
  criadoEm: string;
  primeiroCommitEm: string;
  /** O commit do squash na main. */
  commitDoMerge: string | null;
  /** PR de reversão ou com a label `incidente`: corrige um deploy anterior. */
  correcao: boolean;
  /** Número do PR revertido, quando dá para saber. */
  reverte: number | null;
};

// A descrição que o passo "Criar GitHub Deployment" do deploy.yml dá ao Deployment. O Actions
// também cria sozinho um Deployment, sem descrição, para o job que declara `environment:`; ele
// contaria cada deploy em dobro. Mudou a descrição no deploy.yml? Mude aqui também.
export const DESCRICAO_DO_DEPLOY = 'Deploy contínuo no Render';

// O deploy.yml registra in_progress, depois success ou failure. Quando um deploy mais novo
// dá certo, o GitHub marca o anterior como inactive, então o resultado é o status final que
// apareceu, não o último.
export function paraDeploy(deployment: DeploymentDoGitHub): Deploy | null {
  if (deployment.description !== DESCRICAO_DO_DEPLOY) return null;
  const final = deployment.statuses.nodes.find((status) =>
    ['SUCCESS', 'FAILURE', 'ERROR'].includes(status.state),
  );
  if (!final) return null;
  return {
    id: deployment.databaseId,
    sha: deployment.commitOid,
    resultado: final.state === 'SUCCESS' ? 'sucesso' : 'falha',
    em: final.createdAt,
  };
}

export function paraPr(pr: PrDoGitHub): Pr {
  const revert = pr.title.match(/^Revert "(.*)"$/);
  // O botão Revert do GitHub escreve "Reverts dono/repo#N" no corpo. O `git revert` do squash
  // repete o título revertido, que termina com o (#N) do PR.
  const revertido =
    pr.body.match(/Reverts [\w.-]+\/[\w.-]+#(\d+)/)?.[1] ?? revert?.[1]?.match(/\(#(\d+)\)$/)?.[1];
  return {
    numero: pr.number,
    criadoEm: pr.createdAt,
    primeiroCommitEm: pr.commits.nodes[0]?.commit.authoredDate ?? pr.createdAt,
    commitDoMerge: pr.mergeCommit?.oid ?? null,
    correcao: revert !== null || pr.labels.nodes.some((label) => label.name === 'incidente'),
    reverte: revertido ? Number(revertido) : null,
  };
}

/** Mediana em minutos e de quantos valores ela saiu. */
export type Mediana = { minutos: number; de: number };

export type Resumo = {
  /** Deploys que terminaram, com sucesso ou com falha. */
  deploys: number;
  sucessos: number;
  /** Falharam no health check ou precisaram de correção depois. */
  comFalha: number;
  leadTime: Mediana | null;
  restauracao: Mediana | null;
  /** Deploys com falha que ainda não tiveram um deploy com sucesso que os corrigisse. */
  naoRestaurados: number;
};

export type Dora = {
  /** Da semana do primeiro deploy até a de `agora`, inclusive as semanas sem deploy. */
  semanas: ({ segunda: string } & Resumo)[];
  total: Resumo;
  /**
   * Deploys com sucesso por semana desde a segunda do primeiro deploy, contando da semana em
   * andamento só o que já passou (no mínimo uma semana), ou null sem nenhum deploy.
   */
  frequencia: number | null;
};

export type EntradaDora = {
  deploys: Deploy[];
  prs: Pr[];
  /** Os commits da main, do mais antigo para o mais novo. */
  commitsDaMain: string[];
  agora: string;
};

/** O que cada deploy contribui para as métricas, antes de agrupar por semana. */
type Contagem = {
  deploy: Deploy;
  comFalha: boolean;
  leadTimes: number[];
  /** Quando saiu o deploy com sucesso que restaurou este, se ele teve falha. */
  restauradoEm: string | null;
};

export function calcularDora({ deploys, prs, commitsDaMain, agora }: EntradaDora): Dora {
  const contagens: Contagem[] = [...deploys]
    .sort((a, b) => a.em.localeCompare(b.em))
    .map((deploy) => ({
      deploy,
      comFalha: deploy.resultado === 'falha',
      leadTimes: [],
      restauradoEm: null,
    }));

  // A main só aceita squash, então o histórico é linear: um deploy contém um PR quando o
  // commit do squash vem antes do commit do deploy (ou é ele). Deploy de outro branch (rodado
  // à mão) conta na frequência e na taxa de falha, mas não contém PR nem restaura a main.
  const posicao = new Map(commitsDaMain.map((sha, i) => [sha, i]));
  const posicaoDe = (sha: string | null) => (sha === null ? undefined : posicao.get(sha));
  const sucessos = contagens.filter(
    (c) => c.deploy.resultado === 'sucesso' && posicao.has(c.deploy.sha),
  );
  const inicio = contagens.map((c) => posicaoDe(c.deploy.sha)).find((p) => p !== undefined);

  // PRs mergeados antes do primeiro deploy ficam de fora: não havia esteira para medir.
  const deployDoPr = new Map<number, Contagem>();
  for (const pr of prs) {
    const alvo = posicaoDe(pr.commitDoMerge);
    if (alvo === undefined || inicio === undefined || alvo < inicio) continue;
    const contem = sucessos.find((c) => posicao.get(c.deploy.sha)! >= alvo);
    if (!contem) continue;
    deployDoPr.set(pr.numero, contem);
    contem.leadTimes.push(minutosEntre(pr.primeiroCommitEm, contem.deploy.em));
  }

  // Falha no health check: restaurado pelo próximo deploy com sucesso.
  for (const falha of contagens.filter((c) => c.deploy.resultado === 'falha')) {
    falha.restauradoEm = sucessos.find((c) => c.deploy.em > falha.deploy.em)?.deploy.em ?? null;
  }

  // Correção (reversão ou incidente): corrige o deploy que levou o PR revertido ou, sem saber
  // qual PR foi, o que estava no ar quando a correção foi aberta. Restaura quando ela é publicada.
  for (const correcao of prs.filter((pr) => pr.correcao)) {
    const corrigido =
      (correcao.reverte === null ? undefined : deployDoPr.get(correcao.reverte)) ??
      sucessos.findLast((c) => c.deploy.em <= correcao.criadoEm);
    const publicada = deployDoPr.get(correcao.numero);
    // Revertido antes de chegar à produção: o deploy que levou o PR já levou a reversão junto.
    if (!corrigido || publicada === corrigido) continue;
    corrigido.comFalha = true;
    const restauradoEm = publicada?.deploy.em;
    if (restauradoEm && (corrigido.restauradoEm === null || restauradoEm < corrigido.restauradoEm))
      corrigido.restauradoEm = restauradoEm;
  }

  const total = resumir(contagens);
  const primeiro = contagens[0];
  if (!primeiro) return { semanas: [], total, frequencia: null };

  const semanas = segundasEntre(segundaDe(primeiro.deploy.em), segundaDe(agora)).map((segunda) => ({
    segunda,
    ...resumir(contagens.filter((c) => segundaDe(c.deploy.em) === segunda)),
  }));
  const semanasPassadas = (Date.parse(agora) - inicioDaSemana(semanas[0]!.segunda)) / SEMANA_EM_MS;
  return { semanas, total, frequencia: total.sucessos / Math.max(1, semanasPassadas) };
}

function minutosEntre(de: string, ate: string): number {
  return (new Date(ate).getTime() - new Date(de).getTime()) / 60_000;
}

function mediana(valores: number[]): Mediana | null {
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  if (ordenados.length === 0) return null;
  const minutos =
    ordenados.length % 2 === 1 ? ordenados[meio]! : (ordenados[meio - 1]! + ordenados[meio]!) / 2;
  return { minutos, de: ordenados.length };
}

const HORA_EM_MS = 60 * 60 * 1000;
const DIA_EM_MS = 24 * HORA_EM_MS;
const SEMANA_EM_MS = 7 * DIA_EM_MS;
// Brasília é UTC−3 o ano todo desde o fim do horário de verão, em 2019.
const FUSO_EM_MS = -3 * HORA_EM_MS;

// A segunda-feira (AAAA-MM-DD) da semana do instante, no horário de Brasília.
function segundaDe(instante: string): string {
  const local = new Date(Date.parse(instante) + FUSO_EM_MS);
  const desdeSegunda = (local.getUTCDay() + 6) % 7;
  return new Date(local.getTime() - desdeSegunda * DIA_EM_MS).toISOString().slice(0, 10);
}

// O instante da meia-noite de Brasília que abre a semana.
function inicioDaSemana(segunda: string): number {
  return Date.parse(`${segunda}T00:00:00Z`) - FUSO_EM_MS;
}

function segundasEntre(primeira: string, ultima: string): string[] {
  const segundas: string[] = [];
  for (
    let dia = new Date(`${primeira}T00:00:00Z`);
    ;
    dia = new Date(dia.getTime() + SEMANA_EM_MS)
  ) {
    const segunda = dia.toISOString().slice(0, 10);
    if (segunda > ultima) return segundas;
    segundas.push(segunda);
  }
}

function resumir(contagens: Contagem[]): Resumo {
  const comFalha = contagens.filter((c) => c.comFalha);
  return {
    deploys: contagens.length,
    sucessos: contagens.filter((c) => c.deploy.resultado === 'sucesso').length,
    comFalha: comFalha.length,
    leadTime: mediana(contagens.flatMap((c) => c.leadTimes)),
    restauracao: mediana(
      comFalha.flatMap((c) => (c.restauradoEm ? [minutosEntre(c.deploy.em, c.restauradoEm)] : [])),
    ),
    naoRestaurados: comFalha.filter((c) => c.restauradoEm === null).length,
  };
}

const SEM_DADOS = 'sem dados ainda';
const COMO_MEDIMOS = {
  frequencia: 'Deployments com sucesso em `producao` por semana',
  leadTime: 'Do primeiro commit do PR até o deploy com sucesso que o contém',
  taxaDeFalha:
    'Deploys que falharam no health check ou que precisaram de correção (PR de reversão ou com a label `incidente` depois dele)',
  restauracao:
    'Do deploy que falhou (ou que gerou o `incidente`) até o deploy com sucesso que o corrigiu',
};

export function relatorioMd({ semanas, total, frequencia }: Dora, agora: string): string {
  const linhas = [
    '## Métricas DORA',
    '',
    `Gerado em ${dataHora(agora)} (horário de Brasília) por \`npm run dora\`, a partir dos Deployments do ambiente \`producao\` e dos PRs mergeados na \`main\`.`,
    '',
    '| Métrica | Valor | Como medimos |',
    '|---|---|---|',
    `| Frequência de deploy | ${
      frequencia === null
        ? SEM_DADOS
        : `${numero(frequencia)} por semana (${total.sucessos} desde ${diaMes(semanas[0]!.segunda)})`
    } | ${COMO_MEDIMOS.frequencia} |`,
    `| Lead time de mudança | ${
      total.leadTime === null
        ? SEM_DADOS
        : `${duracao(total.leadTime.minutos)} (mediana de ${total.leadTime.de} ${total.leadTime.de === 1 ? 'PR' : 'PRs'})`
    } | ${COMO_MEDIMOS.leadTime} |`,
    `| Taxa de falha de mudança | ${
      total.deploys === 0
        ? SEM_DADOS
        : `${Math.round((100 * total.comFalha) / total.deploys)}% (${total.comFalha} de ${total.deploys} ${total.deploys === 1 ? 'deploy' : 'deploys'})`
    } | ${COMO_MEDIMOS.taxaDeFalha} |`,
    `| Tempo de restauração | ${restauracaoTotal(total)} | ${COMO_MEDIMOS.restauracao} |`,
    '',
    '### Por semana',
    '',
  ];
  if (semanas.length === 0) {
    linhas.push(
      'Nenhum deploy registrado em `producao` ainda. A tabela por semana aparece depois do primeiro deploy.',
    );
  } else {
    linhas.push(
      'Semanas de segunda a domingo, pela data de cada deploy. A última ainda está em andamento.',
      '',
      '| Semana | Deploys com sucesso | Com falha | Lead time (mediana) | Restauração (mediana) |',
      '|---|---|---|---|---|',
      ...semanas.map(
        (s, i) =>
          `| ${diaMes(s.segunda)}${i === semanas.length - 1 ? ' (em andamento)' : ''} | ${s.sucessos} | ${
            s.deploys === 0 ? '—' : `${s.comFalha} de ${s.deploys}`
          } | ${s.leadTime === null ? '—' : duracao(s.leadTime.minutos)} | ${
            s.restauracao !== null
              ? duracao(s.restauracao.minutos)
              : s.naoRestaurados > 0
                ? 'ainda não'
                : '—'
          } |`,
      ),
    );
  }
  linhas.push(
    '',
    'PRs mergeados antes do primeiro deploy ficam fora do lead time: não havia esteira para medir.',
    '',
  );
  return linhas.join('\n');
}

function restauracaoTotal({ comFalha, restauracao, naoRestaurados }: Resumo): string {
  if (comFalha === 0) return SEM_DADOS;
  const pendentes = naoRestaurados > 0 ? `${naoRestaurados} ainda sem restauração` : '';
  if (restauracao === null) return pendentes;
  return `${duracao(restauracao.minutos)} (mediana de ${restauracao.de}${pendentes && `; ${pendentes}`})`;
}

function duracao(minutos: number): string {
  if (minutos < 1) return 'menos de 1 min';
  const total = Math.round(minutos);
  if (total < 60) return `${total} min`;
  const [maior, menor, unidades] =
    total < 24 * 60
      ? [Math.floor(total / 60), total % 60, ['h', 'min']]
      : [Math.floor(total / (24 * 60)), Math.floor((total % (24 * 60)) / 60), ['d', 'h']];
  return menor === 0
    ? `${maior} ${unidades[0]}`
    : `${maior} ${unidades[0]} ${menor} ${unidades[1]}`;
}

function diaMes(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

function numero(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function dataHora(instante: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
    .format(new Date(instante))
    .replace(',', '');
}
