// Monta o quadro a partir dos tickets, sem I/O: quem lê o GitHub e grava os arquivos é o gerar.ts.

import { REPO, type Pessoa } from './equipe';

/** A issue como vem de `GET /repos/{repo}/issues`, só com o que o quadro usa. */
export type IssueDoGitHub = {
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  assignees: { login: string }[];
  labels: (string | { name: string })[];
  milestone: { title: string } | null;
  issue_dependencies_summary?: { blocked_by: number; total_blocked_by: number };
  pull_request?: unknown;
};

export type Ticket = {
  numero: number;
  titulo: string;
  url: string;
  fechado: boolean;
  /** Nome de quem pegou (ou o login, se não for da equipe). */
  quem: string[];
  labels: string[];
  /** Número do milestone "Incremento N", ou null sem milestone. */
  incremento: number | null;
  /** Quantos tickets que bloqueiam este ainda estão abertos. */
  bloqueios: number;
};

export type Situacao = 'feito' | 'andamento' | 'livre' | 'bloqueado';

const ROTULO: Record<Situacao, string> = {
  feito: '✅ Feito',
  andamento: '🔵 Em andamento',
  livre: '🟡 Livre',
  bloqueado: '⏳ Bloqueado',
};

// Cores do JSON Canvas: 3 amarelo, 4 verde, 5 ciano; o bloqueado fica sem cor.
const COR: Record<Situacao, string | undefined> = {
  feito: '4',
  andamento: '5',
  livre: '3',
  bloqueado: undefined,
};

const INFRA = { nome: 'Infra', descricao: 'Fundação, CI, deploy, seed', label: 'infra' };
const CABECALHO = ['---', 'tags: [equipe, gerado]', '---'];
const AVISO =
  '> Gerado por `npm run quadro`. Não edite à mão: rode o comando de novo. ' +
  `A fonte oficial são as [issues do GitHub](https://github.com/${REPO}/issues?q=label%3Aready-for-human).`;

export function paraTicket(issue: IssueDoGitHub, equipe: Pessoa[]): Ticket {
  const incremento = issue.milestone?.title.match(/^Incremento (\d+)$/)?.[1];
  return {
    numero: issue.number,
    titulo: issue.title,
    url: issue.html_url,
    fechado: issue.state === 'closed',
    quem: issue.assignees.map((a) => equipe.find((p) => p.login === a.login)?.nome ?? a.login),
    labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name)),
    incremento: incremento === undefined ? null : Number(incremento),
    bloqueios: issue.issue_dependencies_summary?.blocked_by ?? 0,
  };
}

export function situacao(ticket: Ticket): Situacao {
  if (ticket.fechado) return 'feito';
  if (ticket.quem.length > 0) return 'andamento';
  return ticket.bloqueios > 0 ? 'bloqueado' : 'livre';
}

function link(ticket: Ticket): string {
  const titulo = ticket.titulo.replace(/[[\]]/g, '\\$&');
  return `[#${ticket.numero} ${titulo}](${ticket.url})`;
}

function celula(texto: string): string {
  return texto.replace(/\|/g, '\\|');
}

function nomeDoIncremento(incremento: number | null): string {
  return incremento === null ? 'Sem incremento' : `Incremento ${incremento}`;
}

function abreviado(incremento: number | null): string {
  return incremento === null ? 'Sem inc.' : `Inc. ${incremento}`;
}

/** Os incrementos que aparecem nos tickets, em ordem, com "sem incremento" no fim. */
function incrementos(tickets: Ticket[]): (number | null)[] {
  const numeros = [...new Set(tickets.map((t) => t.incremento))];
  return numeros.sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
}

function porIncremento(a: Ticket, b: Ticket): number {
  return (a.incremento ?? Infinity) - (b.incremento ?? Infinity) || a.numero - b.numero;
}

function modulosDe(ticket: Ticket): string {
  const modulos = ticket.labels.filter((l) => /^M\d/.test(l) || l === 'infra' || l === 'manual');
  return modulos.join(', ') || '—';
}

function texto(linhas: string[]): string {
  return linhas.join('\n') + '\n';
}

export function quadroMd(tickets: Ticket[], equipe: Pessoa[]): string {
  const linhas = [
    ...CABECALHO,
    '# Quadro da equipe',
    '',
    AVISO,
    '',
    'Visual: [[Quadro da equipe.canvas]] · Pessoas: ' +
      equipe.map((p) => `[[${p.nome}]]`).join(' · '),
    '',
    '## Progresso por incremento',
    '',
    '| Incremento | Feitos | Em andamento | Livres | Bloqueados |',
    '|---|---|---|---|---|',
  ];
  for (const incremento of incrementos(tickets)) {
    const situacoes = tickets.filter((t) => t.incremento === incremento).map(situacao);
    const quantos = (s: Situacao) => situacoes.filter((x) => x === s).length;
    linhas.push(
      `| ${nomeDoIncremento(incremento)} | ${quantos('feito')}/${situacoes.length} | ` +
        `${quantos('andamento')} | ${quantos('livre')} | ${quantos('bloqueado')} |`,
    );
  }
  for (const incremento of incrementos(tickets)) {
    linhas.push(
      '',
      `## ${nomeDoIncremento(incremento)}`,
      '',
      '| Ticket | Módulo | Quem pegou | Situação |',
      '|---|---|---|---|',
    );
    for (const t of tickets.filter((t) => t.incremento === incremento)) {
      linhas.push(
        `| ${celula(link(t))} | ${modulosDe(t)} | ${t.quem.join(', ') || '—'} | ${ROTULO[situacao(t)]} |`,
      );
    }
  }
  return texto(linhas);
}

function sigla(pessoa: Pessoa): string {
  return pessoa.label.split(' ')[0] ?? pessoa.label;
}

export function notaDaPessoa(pessoa: Pessoa, tickets: Ticket[], equipe: Pessoa[]): string {
  const revisor = equipe.find((p) => p.nome === pessoa.revisor);
  const revisados = equipe.filter((p) => p.revisor === pessoa.nome);
  const pegou = tickets.filter((t) => t.quem.includes(pessoa.nome));
  const doModulo = tickets.filter((t) => t.labels.includes(pessoa.label));
  const item = (t: Ticket) => `- ${ROTULO[situacao(t)]} · ${abreviado(t.incremento)} · ${link(t)}`;

  return texto([
    ...CABECALHO,
    `# ${pessoa.nome}`,
    '',
    AVISO,
    '',
    `- **Responsável por:** ${pessoa.modulo}`,
    `- **PRs revisados por:** ${revisor ? `${revisor.nome} (${sigla(revisor)})` : pessoa.revisor}`,
    `- **Revisa os PRs de:** ${revisados.map((p) => `${p.nome} (${sigla(p)})`).join(', ') || '—'}`,
    `- **GitHub:** [${pessoa.login}](https://github.com/${pessoa.login})`,
    `- **Tickets que pegou:** ${pegou.length} (${pegou.filter((t) => t.fechado).length} feitos)`,
    '',
    '## Tickets que pegou',
    '',
    ...(pegou.length > 0 ? pegou.map(item) : ['- (nenhum ainda)']),
    '',
    `## Tickets do módulo ${sigla(pessoa)}`,
    '',
    '_O responsável cuida da coerência do módulo, mas qualquer um pode puxar._',
    '',
    ...doModulo.map((t) => item(t) + (t.quem.length > 0 ? ` · com ${t.quem.join(', ')}` : '')),
    '',
    'Voltar: [[Quadro]]',
  ]);
}

type No = {
  id: string;
  type: 'group' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  text?: string;
  color?: string;
};

const LARGURA = 320;
const ALTURA = 90;
const ESPACO = 20;
const TOPO = 120;

/** JSON Canvas do Obsidian: uma coluna por integrante e uma de Infra, um cartão por ticket. */
export function canvas(tickets: Ticket[], equipe: Pessoa[]): string {
  const colunas = [
    ...equipe.map((p) => ({ nome: p.nome, descricao: p.modulo, label: p.label })),
    INFRA,
  ];
  const colunaDe = (t: Ticket) =>
    colunas.find((c) => c.label !== INFRA.label && t.labels.includes(c.label)) ?? INFRA;

  const nos: No[] = colunas.flatMap((coluna, c) => {
    const x = c * (LARGURA + 60);
    const cartoes = tickets.filter((t) => colunaDe(t) === coluna).sort(porIncremento);
    return [
      {
        id: `g${c}`,
        type: 'group',
        x: x - 20,
        y: -20,
        width: LARGURA + 40,
        height: TOPO + cartoes.length * (ALTURA + ESPACO) + 20,
        label: `${coluna.nome} · ${coluna.descricao}`,
      },
      {
        id: `h${c}`,
        type: 'text',
        x,
        y: 10,
        width: LARGURA,
        height: 80,
        text: `## ${coluna.nome}\n${coluna.descricao}`,
      },
      ...cartoes.map((t, k): No => ({
        id: `i${t.numero}`,
        type: 'text',
        x,
        y: TOPO + k * (ALTURA + ESPACO),
        width: LARGURA,
        height: ALTURA,
        text:
          `**${abreviado(t.incremento)}** · ${link(t)}\n${ROTULO[situacao(t)]}` +
          (t.quem.length > 0 ? ` · ${t.quem.join(', ')}` : ''),
        ...(COR[situacao(t)] ? { color: COR[situacao(t)] } : {}),
      })),
    ];
  });
  return JSON.stringify({ nodes: nos, edges: [] }, null, 1) + '\n';
}

/** Nome de cada arquivo da pasta quadro/ e o conteúdo dele. */
export function arquivosDoQuadro(tickets: Ticket[], equipe: Pessoa[]): Map<string, string> {
  const ordenados = [...tickets].sort((a, b) => a.numero - b.numero);
  return new Map([
    ['Quadro.md', quadroMd(ordenados, equipe)],
    ['Quadro da equipe.canvas', canvas(ordenados, equipe)],
    ...equipe.map((p): [string, string] => [`${p.nome}.md`, notaDaPessoa(p, ordenados, equipe)]),
  ]);
}
