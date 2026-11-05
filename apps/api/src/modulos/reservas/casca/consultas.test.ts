import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from '../../../comum/banco';
import { sessaoDe, umaApp } from '../../../teste/app';
import {
  bancoDeTeste,
  comBanco,
  esvaziar,
  umaReserva,
  umEspaco,
  umUsuario,
} from '../../../teste/banco';

let banco: Banco;

type App = Awaited<ReturnType<typeof umaApp>>;

function listar(app: App, usuarioId: number, consulta = '') {
  return app.inject({
    method: 'GET',
    url: `/api/reservas${consulta}`,
    cookies: sessaoDe(app, usuarioId),
  });
}

function abrir(app: App, usuarioId: number, id: number) {
  return app.inject({
    method: 'GET',
    url: `/api/reservas/${id}`,
    cookies: sessaoDe(app, usuarioId),
  });
}

/** Das 10h às 11h do dia `dia` de dezembro de 2026. */
const noDia = (dia: number) => {
  const dd = String(dia).padStart(2, '0');
  return { inicio: `2026-12-${dd}T10:00:00-03:00`, fim: `2026-12-${dd}T11:00:00-03:00` };
};

comBanco('US10 · Minhas reservas', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('Ativas: só Pendente, Confirmada e Em uso do Usuário, da mais próxima à mais distante', async () => {
    const app = await umaApp({ banco });
    const ana = await umUsuario(banco);
    const bruno = await umUsuario(banco);
    const lab = await umEspaco(banco, { nome: 'Laboratório 3' });
    const base = { usuarioId: ana.id, recursoId: lab.id };
    const distante = await umaReserva(banco, { ...base, ...noDia(3), status: 'Pendente' });
    const proxima = await umaReserva(banco, { ...base, ...noDia(1), status: 'EmUso' });
    const meio = await umaReserva(banco, { ...base, ...noDia(2) });
    await umaReserva(banco, { ...base, ...noDia(4), status: 'Cancelada' });
    await umaReserva(banco, { usuarioId: bruno.id, recursoId: lab.id, ...noDia(5) });

    const resposta = await listar(app, ana.id);

    expect(resposta.statusCode).toBe(200);
    const pagina = resposta.json();
    expect(pagina).toMatchObject({ total: 3, pagina: 1, porPagina: 20 });
    expect(pagina.itens.map(({ id }: { id: number }) => id)).toEqual([
      proxima.id,
      meio.id,
      distante.id,
    ]);
    expect(pagina.itens[0]).toEqual({
      id: proxima.id,
      recursoId: lab.id,
      recurso: { id: lab.id, nome: 'Laboratório 3', tipo: 'Espaco' },
      serieId: null,
      inicio: '2026-12-01T10:00:00-03:00',
      fim: '2026-12-01T11:00:00-03:00',
      participantes: null,
      finalidade: null,
      status: 'EmUso',
      criadaEm: '2026-11-01T08:00:00-03:00',
    });
  });

  it('Encerradas: as demais, da mais recente à mais antiga', async () => {
    const app = await umaApp({ banco });
    const ana = await umUsuario(banco);
    const lab = await umEspaco(banco);
    const base = { usuarioId: ana.id, recursoId: lab.id };
    await umaReserva(banco, { ...base, ...noDia(5) });
    const antiga = await umaReserva(banco, { ...base, ...noDia(1), status: 'Cancelada' });
    const recente = await umaReserva(banco, { ...base, ...noDia(3), status: 'Concluida' });
    const meio = await umaReserva(banco, { ...base, ...noDia(2), status: 'NaoComparecimento' });

    const resposta = await listar(app, ana.id, '?situacao=encerradas');

    expect(resposta.json().itens.map(({ id }: { id: number }) => id)).toEqual([
      recente.id,
      meio.id,
      antiga.id,
    ]);
  });

  it('20 por página: 21 Reservas dão 20 na primeira e 1 na segunda', async () => {
    const app = await umaApp({ banco });
    const ana = await umUsuario(banco);
    const lab = await umEspaco(banco);
    for (let dia = 1; dia <= 21; dia++) {
      await umaReserva(banco, { usuarioId: ana.id, recursoId: lab.id, ...noDia(dia) });
    }

    const primeira = (await listar(app, ana.id)).json();
    const segunda = (await listar(app, ana.id, '?situacao=ativas&pagina=2')).json();

    expect(primeira).toMatchObject({ total: 21, pagina: 1, porPagina: 20 });
    expect(primeira.itens).toHaveLength(20);
    expect(segunda).toMatchObject({ total: 21, pagina: 2, porPagina: 20 });
    expect(segunda.itens.map(({ inicio }: { inicio: string }) => inicio)).toEqual([
      '2026-12-21T10:00:00-03:00',
    ]);
  });

  it.each(['?situacao=todas', '?pagina=0'])('entrada inválida %s → 400', async (consulta) => {
    const app = await umaApp({ banco });
    const ana = await umUsuario(banco);

    expect((await listar(app, ana.id, consulta)).statusCode).toBe(400);
  });

  it('Gestor não tem Minhas reservas → 403', async () => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor');

    expect((await listar(app, carlos.id)).statusCode).toBe(403);
  });

  it('sem sessão → 401', async () => {
    const app = await umaApp({ banco });

    const resposta = await app.inject({ method: 'GET', url: '/api/reservas' });

    expect(resposta.statusCode).toBe(401);
  });
});

comBanco('US10 · Detalhe da Reserva', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  /** Reserva da Ana num Recurso do Carlos, recusada por ele, com o histórico fora de ordem. */
  async function reservaDecidida() {
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const lab = await umEspaco(banco, { gestorId: carlos.id, nome: 'Laboratório 3' });
    const reserva = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: lab.id,
      finalidade: 'Monitoria',
      status: 'Recusada',
    });
    await banco.transicao.createMany({
      data: [
        {
          reservaId: reserva.id,
          de: 'Pendente',
          para: 'Recusada',
          em: new Date('2026-11-02T09:00:00-03:00'),
          porId: carlos.id,
          observacao: 'Evento no mesmo dia',
        },
        {
          reservaId: reserva.id,
          para: 'Pendente',
          em: new Date('2026-11-01T08:00:00-03:00'),
          porId: ana.id,
        },
      ],
    });
    return { carlos, ana, lab, reserva };
  }

  const HISTORICO = (ana: { id: number }, carlos: { id: number }) => [
    {
      de: null,
      para: 'Pendente',
      em: '2026-11-01T08:00:00-03:00',
      por: { id: ana.id, nome: 'Ana' },
      observacao: null,
    },
    {
      de: 'Pendente',
      para: 'Recusada',
      em: '2026-11-02T09:00:00-03:00',
      por: { id: carlos.id, nome: 'Carlos' },
      observacao: 'Evento no mesmo dia',
    },
  ];

  it('a dona vê a Reserva com o histórico, do mais antigo ao mais novo', async () => {
    const app = await umaApp({ banco });
    const { ana, carlos, lab, reserva } = await reservaDecidida();

    const resposta = await abrir(app, ana.id, reserva.id);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      id: reserva.id,
      recursoId: lab.id,
      recurso: { id: lab.id, nome: 'Laboratório 3', tipo: 'Espaco' },
      usuario: { id: ana.id, nome: 'Ana' },
      serieId: null,
      inicio: '2026-11-10T10:00:00-03:00',
      fim: '2026-11-10T12:00:00-03:00',
      participantes: null,
      finalidade: 'Monitoria',
      status: 'Recusada',
      criadaEm: '2026-11-01T08:00:00-03:00',
      historico: HISTORICO(ana, carlos),
    });
  });

  it('o Gestor responsável também abre', async () => {
    const app = await umaApp({ banco });
    const { ana, carlos, reserva } = await reservaDecidida();

    const resposta = await abrir(app, carlos.id, reserva.id);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().historico).toEqual(HISTORICO(ana, carlos));
  });

  it('transição do sistema vem com `por` vazio', async () => {
    const app = await umaApp({ banco });
    const ana = await umUsuario(banco);
    const reserva = await umaReserva(banco, { usuarioId: ana.id, status: 'Expirada' });
    await banco.transicao.create({
      data: {
        reservaId: reserva.id,
        de: 'Pendente',
        para: 'Expirada',
        em: new Date('2026-11-02T09:00:00-03:00'),
      },
    });

    const resposta = await abrir(app, ana.id, reserva.id);

    expect(resposta.json().historico).toMatchObject([{ para: 'Expirada', por: null }]);
  });

  it('RN22 · outra pessoa → 403 citando a regra, sem nada da Reserva', async () => {
    const app = await umaApp({ banco });
    const { reserva } = await reservaDecidida();
    const bruno = await umUsuario(banco);

    const resposta = await abrir(app, bruno.id, reserva.id);

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'proibido',
        mensagem:
          'RN22 · Agenda sem nomes: Só quem fez a Reserva e o Gestor do Recurso podem abri-la.',
        violacoes: [
          {
            rn: 'RN22',
            nome: 'Agenda sem nomes',
            mensagem: 'Só quem fez a Reserva e o Gestor do Recurso podem abri-la.',
          },
        ],
      },
    });
  });

  it('RN22 · Gestor de outro Recurso → 403', async () => {
    const app = await umaApp({ banco });
    const { reserva } = await reservaDecidida();
    const dora = await umUsuario(banco, 'Gestor');

    expect((await abrir(app, dora.id, reserva.id)).statusCode).toBe(403);
  });

  it('Reserva que não existe → 404', async () => {
    const app = await umaApp({ banco });
    const ana = await umUsuario(banco);

    expect((await abrir(app, ana.id, 999)).statusCode).toBe(404);
  });
});
