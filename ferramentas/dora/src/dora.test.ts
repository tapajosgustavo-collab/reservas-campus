import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  calcularDora,
  DESCRICAO_DO_DEPLOY,
  paraDeploy,
  paraPr,
  relatorioMd,
  type Deploy,
  type Dora,
  type Resumo,
  type DeploymentDoGitHub,
  type Pr,
  type PrDoGitHub,
} from './dora';

function umDeployment(estados: [string, string][]): DeploymentDoGitHub {
  return {
    databaseId: 1,
    commitOid: 'abc',
    createdAt: '2026-11-02T12:00:00Z',
    description: 'Deploy contínuo no Render',
    // A API devolve do mais novo para o mais antigo.
    statuses: { nodes: estados.map(([state, createdAt]) => ({ state, createdAt })) },
  };
}

function umPr(parcial: Partial<PrDoGitHub> = {}): PrDoGitHub {
  return {
    number: 90,
    title: 'feat(reservas): cria reserva (#40)',
    body: '',
    createdAt: '2026-11-02T10:00:00Z',
    mergedAt: '2026-11-02T11:00:00Z',
    mergeCommit: { oid: 'm90' },
    labels: { nodes: [] },
    commits: { nodes: [{ commit: { authoredDate: '2026-11-01T09:00:00Z' } }] },
    ...parcial,
  };
}

describe('paraDeploy', () => {
  it('com status success é sucesso na hora desse status, mesmo que depois fique inactive', () => {
    const deployment = umDeployment([
      ['INACTIVE', '2026-11-03T12:00:00Z'],
      ['SUCCESS', '2026-11-02T12:05:00Z'],
      ['IN_PROGRESS', '2026-11-02T12:00:00Z'],
    ]);
    expect(paraDeploy(deployment)).toEqual({
      id: 1,
      sha: 'abc',
      resultado: 'sucesso',
      em: '2026-11-02T12:05:00Z',
    });
  });

  it('com status failure ou error é falha', () => {
    const falha = umDeployment([
      ['FAILURE', '2026-11-02T12:15:00Z'],
      ['IN_PROGRESS', '2026-11-02T12:00:00Z'],
    ]);
    const erro = umDeployment([['ERROR', '2026-11-02T12:01:00Z']]);
    expect(paraDeploy(falha)).toMatchObject({ resultado: 'falha', em: '2026-11-02T12:15:00Z' });
    expect(paraDeploy(erro)).toMatchObject({ resultado: 'falha', em: '2026-11-02T12:01:00Z' });
  });

  it('a descrição filtrada é a que o deploy.yml dá ao Deployment', () => {
    const deployYml = readFileSync(
      new URL('../../../.github/workflows/deploy.yml', import.meta.url),
      'utf8',
    );
    expect(deployYml).toContain(`-f description="${DESCRICAO_DO_DEPLOY}"`);
  });

  it('o Deployment que o Actions cria sozinho para o job com environment não conta', () => {
    const automatico = {
      ...umDeployment([['FAILURE', '2026-11-02T12:15:00Z']]),
      description: null,
    };
    expect(paraDeploy(automatico)).toBeNull();
  });

  it('ainda em andamento (ou sem status) não entra nas métricas', () => {
    expect(paraDeploy(umDeployment([['IN_PROGRESS', '2026-11-02T12:00:00Z']]))).toBeNull();
    expect(paraDeploy(umDeployment([]))).toBeNull();
  });
});

describe('paraPr', () => {
  it('guarda o primeiro commit, o merge e o commit do squash', () => {
    expect(paraPr(umPr())).toEqual({
      numero: 90,
      criadoEm: '2026-11-02T10:00:00Z',
      primeiroCommitEm: '2026-11-01T09:00:00Z',
      commitDoMerge: 'm90',
      correcao: false,
      reverte: null,
    });
  });

  it('com a label incidente é correção', () => {
    const pr = umPr({ labels: { nodes: [{ name: 'infra' }, { name: 'incidente' }] } });
    expect(paraPr(pr)).toMatchObject({ correcao: true, reverte: null });
  });

  it('o botão Revert do GitHub é correção do PR citado no corpo', () => {
    const pr = umPr({
      title: 'Revert "feat(reservas): cria reserva (#40)"',
      body: 'Reverts tapajosgustavo-collab/reservas-campus#57',
    });
    expect(paraPr(pr)).toMatchObject({ correcao: true, reverte: 57 });
  });

  it('o git revert do squash é correção do PR do último (#N) do título revertido', () => {
    const pr = umPr({ title: 'Revert "feat(infra): deploy contínuo (#30) (#78)"', body: '' });
    expect(paraPr(pr)).toMatchObject({ correcao: true, reverte: 78 });
  });

  it('sem commits no PR, conta a partir da abertura dele', () => {
    expect(paraPr(umPr({ commits: { nodes: [] } }))).toMatchObject({
      primeiroCommitEm: '2026-11-02T10:00:00Z',
    });
  });
});

function deploy(id: number, sha: string, resultado: Deploy['resultado'], em: string): Deploy {
  return { id, sha, resultado, em };
}

function pr(
  numero: number,
  commitDoMerge: string,
  primeiroCommitEm: string,
  extra: Partial<Pr> = {},
): Pr {
  return {
    numero,
    criadoEm: primeiroCommitEm,
    primeiroCommitEm,
    commitDoMerge,
    correcao: false,
    reverte: null,
    ...extra,
  };
}

const DIA = '2026-11-03T';

describe('calcularDora', () => {
  it('sem nenhum deploy, não tem semanas nem valores, e não quebra', () => {
    const dora = calcularDora({
      deploys: [],
      prs: [pr(1, 'm1', `${DIA}08:00:00Z`)],
      commitsDaMain: ['m1'],
      agora: `${DIA}12:00:00Z`,
    });
    expect(dora).toEqual({
      semanas: [],
      frequencia: null,
      total: {
        deploys: 0,
        sucessos: 0,
        comFalha: 0,
        leadTime: null,
        restauracao: null,
        naoRestaurados: 0,
      },
    });
  });

  it('frequência: deploys com sucesso por semana, de segunda a domingo no horário de Brasília', () => {
    const dora = calcularDora({
      deploys: [
        deploy(1, 'm1', 'sucesso', '2026-10-27T15:00:00Z'),
        // Domingo, 22h em Brasília: ainda é a semana de 26/10.
        deploy(2, 'm2', 'sucesso', '2026-11-02T01:00:00Z'),
        deploy(3, 'm3', 'falha', '2026-11-10T11:00:00Z'),
        deploy(4, 'm3', 'sucesso', '2026-11-10T12:00:00Z'),
      ],
      prs: [],
      commitsDaMain: ['m1', 'm2', 'm3'],
      // Domingo, 21h em Brasília: a semana de 09/11 está quase completa.
      agora: '2026-11-16T00:00:00Z',
    });
    expect(dora.semanas.map((s) => [s.segunda, s.sucessos, s.deploys])).toEqual([
      ['2026-10-26', 2, 2],
      ['2026-11-02', 0, 0],
      ['2026-11-09', 1, 2],
    ]);
    // 3 deploys com sucesso em 3 semanas menos 3 horas.
    expect(dora.frequencia).toBeCloseTo(3 / (3 - 3 / (7 * 24)), 5);
  });

  it('frequência: a semana em andamento conta só o que passou dela, e o mínimo é uma semana', () => {
    const deploys = [
      deploy(1, 'm1', 'sucesso', '2026-10-27T15:00:00Z'),
      deploy(2, 'm1', 'sucesso', '2026-10-28T15:00:00Z'),
    ];
    // Segunda, 8h em Brasília (a execução agendada): uma semana e oito horas depois de 26/10.
    const naSegunda = calcularDora({
      deploys,
      prs: [],
      commitsDaMain: ['m1'],
      agora: '2026-11-02T11:00:00Z',
    });
    expect(naSegunda.frequencia).toBeCloseTo(2 / (1 + 8 / (7 * 24)), 5);
    // Dois dias depois do primeiro deploy: não vira 7 por semana.
    const logoNoComeco = calcularDora({
      deploys,
      prs: [],
      commitsDaMain: ['m1'],
      agora: '2026-10-29T12:00:00Z',
    });
    expect(logoNoComeco.frequencia).toBe(2);
  });

  it('lead time: do primeiro commit do PR até o primeiro deploy com sucesso que contém o squash', () => {
    const dora = calcularDora({
      deploys: [
        deploy(1, 'm1', 'sucesso', `${DIA}10:30:00Z`),
        deploy(2, 'm3', 'sucesso', `${DIA}12:00:00Z`),
      ],
      prs: [
        // Mergeado antes do primeiro deploy: não havia esteira para medir.
        pr(10, 'm0', '2026-10-01T08:00:00Z'),
        pr(11, 'm1', `${DIA}08:00:00Z`),
        // Mergeado enquanto o deploy 1 rodava: o deploy 1 é do m1 e não o contém.
        pr(12, 'm2', `${DIA}09:00:00Z`),
        pr(13, 'm3', `${DIA}11:00:00Z`),
        // Ainda não foi para produção.
        pr(14, 'm4', `${DIA}11:30:00Z`),
      ],
      commitsDaMain: ['m0', 'm1', 'm2', 'm3', 'm4'],
      agora: `${DIA}13:00:00Z`,
    });
    // 150 min (PR 11), 180 min (PR 12) e 60 min (PR 13).
    expect(dora.total.leadTime).toEqual({ minutos: 150, de: 3 });
    expect(dora.semanas[0]?.leadTime).toEqual({ minutos: 150, de: 3 });
  });

  it('lead time com número par de PRs é a média dos dois do meio', () => {
    const dora = calcularDora({
      // O primeiro deploy conta mesmo com falha: o PR 11 entra, no deploy 2.
      deploys: [
        deploy(1, 'm1', 'falha', `${DIA}11:30:00Z`),
        deploy(2, 'm2', 'sucesso', `${DIA}12:00:00Z`),
      ],
      prs: [pr(11, 'm1', `${DIA}11:00:00Z`), pr(12, 'm2', `${DIA}10:00:00Z`)],
      commitsDaMain: ['m1', 'm2'],
      agora: `${DIA}13:00:00Z`,
    });
    expect(dora.total.leadTime).toEqual({ minutos: 90, de: 2 });
  });

  it('taxa de falha e restauração: falha no health e deploy corrigido por PR com incidente', () => {
    const dora = calcularDora({
      deploys: [
        deploy(1, 'm1', 'sucesso', `${DIA}10:00:00Z`),
        deploy(2, 'm2', 'falha', `${DIA}11:00:00Z`),
        // Rodou de novo o mesmo commit: restaurou a falha do deploy 2 em 40 min.
        deploy(3, 'm2', 'sucesso', `${DIA}11:40:00Z`),
        deploy(4, 'm3', 'sucesso', `${DIA}13:00:00Z`),
        // Publica a correção do deploy 4, 60 min depois dele.
        deploy(5, 'm4', 'sucesso', `${DIA}14:00:00Z`),
      ],
      prs: [
        pr(20, 'm1', `${DIA}09:00:00Z`),
        pr(21, 'm2', `${DIA}09:00:00Z`),
        pr(22, 'm3', `${DIA}12:00:00Z`),
        // Aberto às 13h30, quando o deploy 4 estava no ar.
        pr(23, 'm4', `${DIA}13:10:00Z`, { criadoEm: `${DIA}13:30:00Z`, correcao: true }),
      ],
      commitsDaMain: ['m1', 'm2', 'm3', 'm4'],
      agora: `${DIA}15:00:00Z`,
    });
    expect(dora.total).toMatchObject({
      deploys: 5,
      comFalha: 2,
      restauracao: { minutos: 50, de: 2 },
      naoRestaurados: 0,
    });
  });

  it('a reversão de um PR corrige o deploy que levou esse PR, mesmo com outro deploy depois', () => {
    const dora = calcularDora({
      deploys: [
        deploy(1, 'm1', 'sucesso', `${DIA}10:00:00Z`),
        deploy(2, 'm2', 'sucesso', `${DIA}11:00:00Z`),
        deploy(3, 'm3', 'sucesso', `${DIA}12:30:00Z`),
      ],
      prs: [
        pr(30, 'm1', `${DIA}09:00:00Z`),
        pr(31, 'm2', `${DIA}10:30:00Z`),
        pr(32, 'm3', `${DIA}12:00:00Z`, { correcao: true, reverte: 30 }),
      ],
      commitsDaMain: ['m1', 'm2', 'm3'],
      agora: `${DIA}13:00:00Z`,
    });
    // Só o deploy 1 precisou de correção, restaurado pelo deploy 3.
    expect(dora.total).toMatchObject({ comFalha: 1, restauracao: { minutos: 150, de: 1 } });
  });

  it('falha sem deploy com sucesso depois, ou correção ainda não publicada, fica sem restauração', () => {
    const dora = calcularDora({
      deploys: [
        deploy(1, 'm1', 'sucesso', `${DIA}10:00:00Z`),
        deploy(2, 'm2', 'falha', `${DIA}11:00:00Z`),
      ],
      prs: [
        pr(40, 'm1', `${DIA}09:00:00Z`),
        pr(41, 'm2', `${DIA}10:30:00Z`),
        pr(42, 'm3', `${DIA}11:30:00Z`, { criadoEm: `${DIA}11:30:00Z`, correcao: true }),
      ],
      commitsDaMain: ['m1', 'm2', 'm3'],
      agora: `${DIA}13:00:00Z`,
    });
    expect(dora.total).toMatchObject({ comFalha: 2, restauracao: null, naoRestaurados: 2 });
  });
  it('deploy de outro branch não contém PR nem restaura falha da main', () => {
    const dora = calcularDora({
      deploys: [
        deploy(1, 'm1', 'falha', `${DIA}10:00:00Z`),
        deploy(2, 'ramo', 'sucesso', `${DIA}10:30:00Z`),
        deploy(3, 'm1', 'sucesso', `${DIA}11:00:00Z`),
      ],
      prs: [pr(50, 'm1', `${DIA}09:00:00Z`)],
      commitsDaMain: ['m1'],
      agora: `${DIA}12:00:00Z`,
    });
    expect(dora.total).toMatchObject({
      deploys: 3,
      sucessos: 2,
      leadTime: { minutos: 120, de: 1 },
      restauracao: { minutos: 60, de: 1 },
    });
  });

  it('reversão publicada no mesmo deploy do PR revertido não conta como falha', () => {
    const dora = calcularDora({
      deploys: [
        deploy(1, 'm0', 'sucesso', `${DIA}08:00:00Z`),
        deploy(2, 'm2', 'sucesso', `${DIA}11:00:00Z`),
      ],
      prs: [
        pr(60, 'm1', `${DIA}09:00:00Z`),
        pr(61, 'm2', `${DIA}10:00:00Z`, { correcao: true, reverte: 60 }),
      ],
      commitsDaMain: ['m0', 'm1', 'm2'],
      agora: `${DIA}12:00:00Z`,
    });
    expect(dora.total).toMatchObject({ comFalha: 0, restauracao: null });
  });

  it('reversão de PR que não passou por deploy corrige o deploy que estava no ar', () => {
    const dora = calcularDora({
      deploys: [
        deploy(1, 'm1', 'sucesso', `${DIA}10:00:00Z`),
        deploy(2, 'm2', 'sucesso', `${DIA}12:00:00Z`),
      ],
      prs: [
        // O PR 70 é de antes do primeiro deploy, então não tem deploy conhecido.
        pr(71, 'm1', `${DIA}09:00:00Z`),
        pr(72, 'm2', `${DIA}11:00:00Z`, {
          criadoEm: `${DIA}11:00:00Z`,
          correcao: true,
          reverte: 70,
        }),
      ],
      commitsDaMain: ['m0', 'm1', 'm2'],
      agora: `${DIA}13:00:00Z`,
    });
    expect(dora.total).toMatchObject({ comFalha: 1, restauracao: { minutos: 120, de: 1 } });
  });
});

const VAZIO: Resumo = {
  deploys: 0,
  sucessos: 0,
  comFalha: 0,
  leadTime: null,
  restauracao: null,
  naoRestaurados: 0,
};

describe('relatorioMd', () => {
  it('sem deploys, mostra a tabela das quatro métricas com "sem dados ainda"', () => {
    const md = relatorioMd({ semanas: [], total: VAZIO, frequencia: null }, '2026-11-02T12:00:00Z');
    expect(md).toContain('Gerado em 02/11/2026 09:00 (horário de Brasília)');
    for (const metrica of [
      'Frequência de deploy',
      'Lead time de mudança',
      'Taxa de falha de mudança',
      'Tempo de restauração',
    ]) {
      expect(md).toContain(`\n| ${metrica} | sem dados ainda |`);
    }
    expect(md).toContain('Nenhum deploy registrado em `producao` ainda.');
  });

  it('com deploys, mostra os valores do período e uma linha por semana', () => {
    const semana1: Resumo = {
      deploys: 3,
      sucessos: 2,
      comFalha: 1,
      leadTime: { minutos: 150, de: 3 },
      restauracao: { minutos: 40, de: 1 },
      naoRestaurados: 0,
    };
    const semana2: Resumo = {
      deploys: 2,
      sucessos: 1,
      comFalha: 1,
      leadTime: { minutos: 3 * 24 * 60 + 5 * 60 + 20, de: 1 },
      restauracao: null,
      naoRestaurados: 1,
    };
    const dora: Dora = {
      semanas: [
        { segunda: '2026-10-26', ...semana1 },
        { segunda: '2026-11-02', ...VAZIO },
        { segunda: '2026-11-09', ...semana2 },
      ],
      total: {
        deploys: 5,
        sucessos: 3,
        comFalha: 2,
        leadTime: { minutos: 0.5, de: 4 },
        restauracao: { minutos: 40, de: 1 },
        naoRestaurados: 1,
      },
      frequencia: 1,
    };
    const md = relatorioMd(dora, '2026-11-11T12:00:00Z');
    expect(md).toContain('| Frequência de deploy | 1 por semana (3 desde 26/10) |');
    expect(md).toContain('| Lead time de mudança | menos de 1 min (mediana de 4 PRs) |');
    expect(md).toContain('| Taxa de falha de mudança | 40% (2 de 5 deploys) |');
    expect(md).toContain(
      '| Tempo de restauração | 40 min (mediana de 1; 1 ainda sem restauração) |',
    );
    expect(md).toContain('| 26/10 | 2 | 1 de 3 | 2 h 30 min | 40 min |');
    expect(md).toContain('| 02/11 | 0 | — | — | — |');
    expect(md).toContain('| 09/11 (em andamento) | 1 | 1 de 2 | 3 d 5 h | ainda não |');
  });
});
