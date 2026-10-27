import { describe, expect, it } from 'vitest';
import { EQUIPE } from './equipe';
import {
  arquivosDoQuadro,
  canvas,
  notaDaPessoa,
  paraTicket,
  quadroMd,
  situacao,
  type Ticket,
} from './quadro';

const URL = 'https://github.com/tapajosgustavo-collab/reservas-campus/issues';

function umTicket(parcial: Partial<Ticket> & Pick<Ticket, 'numero'>): Ticket {
  return {
    titulo: `Ticket ${parcial.numero}`,
    url: `${URL}/${parcial.numero}`,
    fechado: false,
    quem: [],
    labels: ['ready-for-human'],
    incremento: 1,
    bloqueios: 0,
    ...parcial,
  };
}

describe('situacao', () => {
  it('fechado é Feito, mesmo com alguém atribuído', () => {
    expect(situacao(umTicket({ numero: 1, fechado: true, quem: ['Kaio'] }))).toBe('feito');
  });

  it('aberto com alguém atribuído é Em andamento, mesmo bloqueado', () => {
    expect(situacao(umTicket({ numero: 1, quem: ['Kaio'], bloqueios: 1 }))).toBe('andamento');
  });

  it('aberto, sem ninguém e com bloqueio aberto é Bloqueado', () => {
    expect(situacao(umTicket({ numero: 1, bloqueios: 2 }))).toBe('bloqueado');
  });

  it('aberto, sem ninguém e sem bloqueio é Livre', () => {
    expect(situacao(umTicket({ numero: 1 }))).toBe('livre');
  });
});

describe('paraTicket', () => {
  it('lê a issue do GitHub com o nome de quem pegou, o incremento e os bloqueios abertos', () => {
    const ticket = paraTicket(
      {
        number: 42,
        title: 'Valida Conflito',
        state: 'open',
        html_url: `${URL}/42`,
        assignees: [{ login: 'rafael-figueredo' }, { login: 'alguem-de-fora' }],
        labels: [{ name: 'ready-for-human' }, { name: 'M3 reservas' }],
        milestone: { title: 'Incremento 2' },
        issue_dependencies_summary: { blocked_by: 1, total_blocked_by: 3 },
      },
      EQUIPE,
    );

    expect(ticket).toEqual({
      numero: 42,
      titulo: 'Valida Conflito',
      url: `${URL}/42`,
      fechado: false,
      quem: ['Rafael', 'alguem-de-fora'],
      labels: ['ready-for-human', 'M3 reservas'],
      incremento: 2,
      bloqueios: 1,
    });
  });

  it('sem milestone fica sem incremento, e sem resumo de dependências fica sem bloqueio', () => {
    const ticket = paraTicket(
      {
        number: 7,
        title: 'Solto',
        state: 'closed',
        html_url: `${URL}/7`,
        assignees: [],
        labels: [],
        milestone: null,
      },
      EQUIPE,
    );

    expect(ticket).toMatchObject({ fechado: true, incremento: null, bloqueios: 0 });
  });
});

describe('quadroMd', () => {
  const tickets = [
    umTicket({ numero: 23, incremento: 0, fechado: true, quem: ['Gustavo'], labels: ['infra'] }),
    umTicket({ numero: 24, incremento: 0, quem: ['Gustavo'], labels: ['infra'] }),
    umTicket({ numero: 33, incremento: 1, bloqueios: 1, labels: ['M1 conduta'] }),
    umTicket({ numero: 34, incremento: 1, titulo: 'Tela [beta] | lista', labels: ['M2 recursos'] }),
  ];

  it('mostra o progresso de cada incremento', () => {
    const md = quadroMd(tickets, EQUIPE);

    expect(md).toContain('| Incremento 0 | 1/2 | 1 | 0 | 0 |');
    expect(md).toContain('| Incremento 1 | 0/2 | 0 | 1 | 1 |');
  });

  it('lista cada ticket com módulo, quem pegou e situação, escapando colchetes e barras do título', () => {
    const md = quadroMd(tickets, EQUIPE);

    expect(md).toContain(`| [#23 Ticket 23](${URL}/23) | infra | Gustavo | ✅ Feito |`);
    expect(md).toContain(`| [#33 Ticket 33](${URL}/33) | M1 conduta | — | ⏳ Bloqueado |`);
    expect(md).toContain(
      `| [#34 Tela \\[beta\\] \\| lista](${URL}/34) | M2 recursos | — | 🟡 Livre |`,
    );
  });

  it('escapa a barra invertida do título junto com colchetes e barras verticais', () => {
    const md = quadroMd(
      [
        umTicket({
          numero: 35,
          titulo: 'Pasta C:\\temp [x] | y',
          labels: ['ready-for-human', 'infra'],
        }),
      ],
      EQUIPE,
    );

    expect(md).toContain(`| [#35 Pasta C:\\\\temp \\[x\\] \\| y](${URL}/35) | infra |`);
  });

  it('liga o canvas e a nota de cada integrante', () => {
    expect(quadroMd(tickets, EQUIPE)).toContain(
      'Visual: [[Quadro da equipe.canvas]] · Pessoas: [[Kaio]] · [[Gustavo]] · [[Rafael]] · [[Guilherme]]',
    );
  });

  it('põe os tickets sem milestone no fim, como Sem incremento', () => {
    const md = quadroMd([umTicket({ numero: 9, incremento: null }), ...tickets], EQUIPE);

    expect(md.indexOf('## Sem incremento')).toBeGreaterThan(md.indexOf('## Incremento 1'));
  });
});

describe('notaDaPessoa', () => {
  const [kaio] = EQUIPE;
  const tickets = [
    umTicket({ numero: 33, labels: ['M1 conduta'], quem: ['Rafael'] }),
    umTicket({ numero: 40, labels: ['M3 reservas'], quem: ['Kaio'], fechado: true }),
  ];

  it('mostra o módulo, quem revisa os PRs dele e de quem ele revisa', () => {
    const nota = notaDaPessoa(kaio!, tickets, EQUIPE);

    expect(nota).toContain('- **Responsável por:** M1 Usuários e conduta');
    expect(nota).toContain('- **PRs revisados por:** Gustavo (M2)');
    expect(nota).toContain('- **Revisa os PRs de:** Guilherme (M4)');
  });

  it('separa os tickets que pegou dos tickets do módulo', () => {
    const nota = notaDaPessoa(kaio!, tickets, EQUIPE);
    const [pegou, doModulo] = nota.split('## Tickets do módulo M1');

    expect(pegou).toContain('- **Tickets que pegou:** 1 (1 feitos)');
    expect(pegou).toContain(`- ✅ Feito · Inc. 1 · [#40 Ticket 40](${URL}/40)`);
    expect(doModulo).toContain(
      `- 🔵 Em andamento · Inc. 1 · [#33 Ticket 33](${URL}/33) · com Rafael`,
    );
    expect(doModulo).not.toContain('#40');
  });
});

describe('canvas', () => {
  const tickets = [
    umTicket({ numero: 24, incremento: 0, quem: ['Gustavo'], labels: ['infra'] }),
    umTicket({ numero: 50, incremento: 3, labels: ['M2 recursos'], fechado: true }),
    umTicket({ numero: 41, incremento: 2, labels: ['M2 recursos'], titulo: 'Grade [v2]' }),
    umTicket({ numero: 60, incremento: 4, labels: ['manual'], bloqueios: 1 }),
  ];
  type No = { id: string; type: string; x: number; y: number; text?: string; color?: string };
  const nos = (): No[] => (JSON.parse(canvas(tickets, EQUIPE)) as { nodes: No[] }).nodes;

  it('tem uma coluna por integrante e uma de Infra', () => {
    const grupos = nos().filter((n) => n.type === 'group');

    expect(grupos.map((g) => (g as No & { label: string }).label)).toEqual([
      'Kaio · M1 Usuários e conduta',
      'Gustavo · M2 Recursos e disponibilidade',
      'Rafael · M3 Motor de reservas',
      'Guilherme · M4 Ciclo de vida',
      'Infra · Fundação, CI, deploy, seed',
    ]);
  });

  it('põe cada ticket na coluna do módulo, por incremento, e o que não é de módulo em Infra', () => {
    const cartao = (n: number) => nos().find((no) => no.id === `i${n}`)!;

    expect(cartao(41).x).toBe(cartao(50).x);
    expect(cartao(41).y).toBeLessThan(cartao(50).y);
    expect(cartao(24).x).toBe(cartao(60).x);
    expect(cartao(24).x).toBeGreaterThan(cartao(50).x);
  });

  it('colore o cartão pela situação e escapa os colchetes do título no link', () => {
    const cartao = (n: number) => nos().find((no) => no.id === `i${n}`)!;

    expect(cartao(24)).toMatchObject({
      color: '5',
      text: `**Inc. 0** · [#24 Ticket 24](${URL}/24)\n🔵 Em andamento · Gustavo`,
    });
    expect(cartao(50).color).toBe('4');
    expect(cartao(41)).toMatchObject({
      color: '3',
      text: `**Inc. 2** · [#41 Grade \\[v2\\]](${URL}/41)\n🟡 Livre`,
    });
    expect(cartao(60).color).toBeUndefined();
  });
});

describe('arquivosDoQuadro', () => {
  it('gera o quadro, o canvas e uma nota por integrante, sempre com o mesmo conteúdo', () => {
    const tickets = [umTicket({ numero: 1 })];

    const arquivos = arquivosDoQuadro(tickets, EQUIPE);

    expect([...arquivos.keys()]).toEqual([
      'Quadro.md',
      'Quadro da equipe.canvas',
      'Kaio.md',
      'Gustavo.md',
      'Rafael.md',
      'Guilherme.md',
    ]);
    expect(arquivosDoQuadro(tickets, EQUIPE)).toEqual(arquivos);
  });
});
