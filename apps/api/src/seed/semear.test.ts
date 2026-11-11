import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from '../comum/banco';
import { RelogioFixo } from '../comum/relogio';
import { sincronizar } from '../modulos/ciclo';
import { umaApp } from '../teste/app';
import { bancoDeTeste, comBanco, esvaziar, umUsuario } from '../teste/banco';
import { semear } from './semear';

let banco: Banco;

// D é a terça da demo e T0 = D às 08:00, o RELOGIO_FIXO do docker-compose.yml (#18).
const T0 = new Date('2026-11-10T08:00:00-03:00');

/**
 * Roda o seed e devolve a app no T0, já com o primeiro `sincronizar`, como na demo. As cenas são
 * conferidas pela API, entrando como os Usuários do "Entrar como…".
 */
async function demoNoT0(agora = T0) {
  await semear(banco, agora);
  await banco.$transaction((tx) => sincronizar(tx, agora));
  const app = await umaApp({ banco, relogio: new RelogioFixo(agora) });

  const sessoes = new Map<string, { sessao: string }>();
  async function entrarComo(email: string) {
    const aberta = sessoes.get(email);
    if (aberta) return aberta;
    const resposta = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email } });
    expect(resposta.statusCode).toBe(200);
    const sessao = resposta.cookies.find(({ name }) => name === 'sessao')!;
    sessoes.set(email, { sessao: sessao.value });
    return sessoes.get(email)!;
  }

  async function get(email: string, url: string) {
    const resposta = await app.inject({ method: 'GET', url, cookies: await entrarComo(email) });
    expect(resposta.statusCode).toBe(200);
    return resposta.json();
  }

  async function idDoRecurso(nome: string): Promise<number> {
    const recursos: { id: number; nome: string }[] = await get(
      'ana.demo@unifesp.br',
      '/api/recursos',
    );
    return recursos.find((recurso) => recurso.nome === nome)!.id;
  }

  return { app, entrarComo, get, idDoRecurso };
}

comBanco('RNF10 · Seed', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('com o banco vazio, roda', async () => {
    expect(await semear(banco, T0)).toBe('semeado');
  });

  it('traz os seis Usuários de demonstração do "Entrar como…" (#18)', async () => {
    await semear(banco, T0);

    const usuarios = await banco.usuario.findMany({
      select: { nome: true, email: true, perfil: true },
      orderBy: { email: 'asc' },
    });
    expect(usuarios).toEqual([
      { nome: 'Ana Souza', email: 'ana.demo@unifesp.br', perfil: 'Aluno' },
      { nome: 'Bia Santos', email: 'bia.demo@unifesp.br', perfil: 'Aluno' },
      { nome: 'Bruno Lima', email: 'bruno.demo@unifesp.br', perfil: 'Aluno' },
      { nome: 'Carlos Mendes', email: 'carlos.demo@unifesp.br', perfil: 'Gestor' },
      { nome: 'Dora Alves', email: 'dora.demo@unifesp.br', perfil: 'Gestor' },
      { nome: 'Eduardo Prado', email: 'eduardo.demo@unifesp.br', perfil: 'Docente' },
    ]);
  });

  it('com dados no banco, não toca em nada', async () => {
    const existente = await umUsuario(banco);

    expect(await semear(banco, T0)).toBe('ignorado');
    expect(await banco.usuario.findMany()).toEqual([existente]);
  });

  it('traz os nove Recursos do #18', async () => {
    const { get } = await demoNoT0();

    const recursos = await get('ana.demo@unifesp.br', '/api/recursos');

    expect(recursos).toMatchObject([
      {
        tipo: 'Espaco',
        nome: 'Auditório',
        local: 'Bloco Central',
        capacidade: 150,
        patrimonio: null,
      },
      {
        tipo: 'Espaco',
        nome: 'Laboratório de Informática 2',
        local: 'Bloco B',
        capacidade: 30,
        patrimonio: null,
      },
      {
        tipo: 'Equipamento',
        nome: 'Notebook Dell N-01',
        local: 'Almoxarifado de TI',
        capacidade: null,
        patrimonio: 'N-01',
      },
      {
        tipo: 'Equipamento',
        nome: 'Notebook Dell N-02',
        local: 'Almoxarifado de TI',
        capacidade: null,
        patrimonio: 'N-02',
      },
      {
        tipo: 'Equipamento',
        nome: 'Projetor Epson P-123',
        local: 'Almoxarifado de TI',
        capacidade: null,
        patrimonio: 'P-123',
      },
      {
        tipo: 'Equipamento',
        nome: 'Projetor Epson P-124',
        local: 'Almoxarifado de TI',
        capacidade: null,
        patrimonio: 'P-124',
      },
      { tipo: 'Espaco', nome: 'Sala 101', local: 'Bloco A', capacidade: 40, patrimonio: null },
      { tipo: 'Espaco', nome: 'Sala 102', local: 'Bloco A', capacidade: 40, patrimonio: null },
      {
        tipo: 'Espaco',
        nome: 'Sala de estudos 3',
        local: 'Biblioteca',
        capacidade: 6,
        patrimonio: null,
      },
    ]);
  });

  it('cada Recurso abre de segunda a sexta, no horário do #18', async () => {
    const { get, idDoRecurso } = await demoNoT0();
    const segASex = (abre: number, fecha: number) =>
      [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: abre * 60, fecha: fecha * 60 }));
    const horarioDe = async (nome: string) =>
      (await get('ana.demo@unifesp.br', `/api/recursos/${await idDoRecurso(nome)}`)).horarios;

    expect({
      'Sala 101': await horarioDe('Sala 101'),
      'Sala 102': await horarioDe('Sala 102'),
      'Sala de estudos 3': await horarioDe('Sala de estudos 3'),
      'Laboratório de Informática 2': await horarioDe('Laboratório de Informática 2'),
      Auditório: await horarioDe('Auditório'),
      'Projetor Epson P-123': await horarioDe('Projetor Epson P-123'),
      'Projetor Epson P-124': await horarioDe('Projetor Epson P-124'),
      'Notebook Dell N-01': await horarioDe('Notebook Dell N-01'),
      'Notebook Dell N-02': await horarioDe('Notebook Dell N-02'),
    }).toEqual({
      'Sala 101': segASex(7, 23),
      'Sala 102': segASex(7, 23),
      'Sala de estudos 3': segASex(8, 22),
      'Laboratório de Informática 2': segASex(7, 23),
      Auditório: segASex(8, 22),
      'Projetor Epson P-123': segASex(7, 22),
      'Projetor Epson P-124': segASex(7, 22),
      'Notebook Dell N-01': segASex(7, 22),
      'Notebook Dell N-02': segASex(7, 22),
    });
  });

  it('cena 1 (RN13): em "Meus recursos", a Dora tem os cinco Espaços e o Carlos, os quatro Equipamentos', async () => {
    const { get } = await demoNoT0();
    const nomes = async (email: string) =>
      (await get(email, '/api/recursos?gestor=eu')).map(({ nome }: { nome: string }) => nome);

    expect(await nomes('dora.demo@unifesp.br')).toEqual([
      'Auditório',
      'Laboratório de Informática 2',
      'Sala 101',
      'Sala 102',
      'Sala de estudos 3',
    ]);
    expect(await nomes('carlos.demo@unifesp.br')).toEqual([
      'Notebook Dell N-01',
      'Notebook Dell N-02',
      'Projetor Epson P-123',
      'Projetor Epson P-124',
    ]);
  });

  it('cena 2 (RN22): na agenda da Sala 101, a Ana vê D 10h–12h ocupado, sem saber de quem', async () => {
    const { get, idDoRecurso } = await demoNoT0();

    const agenda = await get(
      'ana.demo@unifesp.br',
      `/api/recursos/${await idDoRecurso('Sala 101')}/agenda`,
    );

    expect(agenda.ocupacoes).toEqual([
      { inicio: '2026-11-10T10:00:00-03:00', fim: '2026-11-10T12:00:00-03:00' },
    ]);
  });

  it('cena 3 (RN01): a Ana pede a Sala 101 11h–13h → Conflito; 12h–14h só encosta → Confirmada', async () => {
    const { app, entrarComo, idDoRecurso } = await demoNoT0();
    const cookies = await entrarComo('ana.demo@unifesp.br');
    const recursoId = await idDoRecurso('Sala 101');
    const reservar = (inicio: string, fim: string) =>
      app.inject({
        method: 'POST',
        url: '/api/reservas',
        cookies,
        payload: { recursoId, inicio, fim, participantes: 10 },
      });

    const conflito = await reservar('2026-11-10T11:00:00-03:00', '2026-11-10T13:00:00-03:00');
    const encosta = await reservar('2026-11-10T12:00:00-03:00', '2026-11-10T14:00:00-03:00');

    expect(conflito.statusCode).toBe(422);
    expect(conflito.json().erro.violacoes).toMatchObject([
      { rn: 'RN01', mensagem: 'Este Recurso já está ocupado das 10:00 às 12:00.' },
    ]);
    expect(encosta.statusCode).toBe(201);
    expect(encosta.json().status).toBe('Confirmada');
  });

  it('cena 1 (RN04): a Dora cria a "Dedetização" na Sala de estudos 3 em D+1 → 1 Reserva cancelada, a da Bia', async () => {
    const { app, entrarComo, get, idDoRecurso } = await demoNoT0();
    const recursoId = await idDoRecurso('Sala de estudos 3');
    const agendaDaBia = () =>
      get('bia.demo@unifesp.br', `/api/recursos/${recursoId}/agenda`).then(
        ({ ocupacoes }) => ocupacoes,
      );

    expect(await agendaDaBia()).toMatchObject([
      {
        inicio: '2026-11-11T10:00:00-03:00',
        fim: '2026-11-11T12:00:00-03:00',
        minha: true,
        status: 'Confirmada',
      },
    ]);

    const resposta = await app.inject({
      method: 'POST',
      url: `/api/recursos/${recursoId}/indisponibilidades`,
      cookies: await entrarComo('dora.demo@unifesp.br'),
      payload: {
        inicio: '2026-11-11T00:00:00-03:00',
        fim: '2026-11-12T00:00:00-03:00',
        motivo: 'Dedetização',
      },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().reservasCanceladas).toBe(1);
    expect(await agendaDaBia()).toEqual([]);
  });

  it('cena 1: o P-124 está Extraviado, sem fim, e a Sala 102 em manutenção do T0 a D+2', async () => {
    const { get, idDoRecurso } = await demoNoT0();
    const indisponibilidadesDe = async (nome: string) =>
      (await get('ana.demo@unifesp.br', `/api/recursos/${await idDoRecurso(nome)}/agenda`))
        .indisponibilidades;

    expect(await indisponibilidadesDe('Projetor Epson P-124')).toEqual([
      { inicio: '2026-11-07T08:00:00-03:00', fim: null, motivo: 'Extraviado' },
    ]);
    expect(await indisponibilidadesDe('Sala 102')).toEqual([
      {
        inicio: '2026-11-10T08:00:00-03:00',
        fim: '2026-11-12T08:00:00-03:00',
        motivo: 'Manutenção do ar-condicionado',
      },
    ]);
    expect(await indisponibilidadesDe('Sala 101')).toEqual([]);
  });

  it('cena 2 (US06): a Ana busca Espaço para 30 pessoas em D 10h–12h; a Sala 101 e a Sala 102 não aparecem', async () => {
    const { get } = await demoNoT0();
    const busca = new URLSearchParams({
      tipo: 'Espaco',
      capacidadeMin: '30',
      inicio: '2026-11-10T10:00:00-03:00',
      fim: '2026-11-10T12:00:00-03:00',
    });

    const recursos = await get('ana.demo@unifesp.br', `/api/recursos?${busca}`);

    expect(recursos.map(({ nome }: { nome: string }) => nome)).toEqual([
      'Auditório',
      'Laboratório de Informática 2',
    ]);
  });

  it('a Bia tem o Notebook N-01 em D, 9h–11h, Confirmada (a cena 6 da RN23)', async () => {
    const { get, idDoRecurso } = await demoNoT0();

    const agenda = await get(
      'bia.demo@unifesp.br',
      `/api/recursos/${await idDoRecurso('Notebook Dell N-01')}/agenda`,
    );

    expect(agenda.ocupacoes).toMatchObject([
      {
        inicio: '2026-11-10T09:00:00-03:00',
        fim: '2026-11-10T11:00:00-03:00',
        minha: true,
        status: 'Confirmada',
      },
    ]);
  });

  it('a Ana tem a Sala 101 em D−7, 10h–12h, já passada (a aba "Encerradas")', async () => {
    const { get, idDoRecurso } = await demoNoT0();

    const agenda = await get(
      'ana.demo@unifesp.br',
      `/api/recursos/${await idDoRecurso('Sala 101')}/agenda?semana=2026-11-02`,
    );

    // Confirmada até o incremento 4, quando o Check-in das 9h55 faz o sincronizar Concluí-la (RN18).
    expect(agenda.ocupacoes).toMatchObject([
      {
        inicio: '2026-11-03T10:00:00-03:00',
        fim: '2026-11-03T12:00:00-03:00',
        minha: true,
        status: 'Confirmada',
      },
    ]);
  });

  it('o T0 é o agora arredondado para a próxima meia hora (#18)', async () => {
    const { get, idDoRecurso } = await demoNoT0(new Date('2026-11-10T08:10:00-03:00'));

    const agenda = await get(
      'bia.demo@unifesp.br',
      `/api/recursos/${await idDoRecurso('Notebook Dell N-01')}/agenda`,
    );

    expect(agenda.ocupacoes).toMatchObject([
      { inicio: '2026-11-10T09:30:00-03:00', fim: '2026-11-10T11:30:00-03:00' },
    ]);
  });
});
