import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from '../../../comum/banco';
import { RelogioFixo } from '../../../comum/relogio';
import { sessaoDe, umaApp } from '../../../teste/app';
import {
  bancoDeTeste,
  comBanco,
  esvaziar,
  umaReserva,
  umEquipamento,
  umEspaco,
  umUsuario,
} from '../../../teste/banco';

let banco: Banco;

type App = Awaited<ReturnType<typeof umaApp>>;

/** Em São Paulo: `as('10T09:00')` é terça, 10/11/2026, às 9h. */
const as = (diaHora: string) => new Date(`2026-11-${diaHora}:00-03:00`);

/** O `agora` da app do teste: a sessão abre nele, para não vencer (8h) quando o relógio avança. */
let agoraDoTeste: Date;

/** A app com o relógio parado no `diaHora` de novembro de 2026. */
function umaAppAs(diaHora: string) {
  agoraDoTeste = as(diaHora);
  return umaApp({ banco, relogio: new RelogioFixo(agoraDoTeste) });
}

const sessao = (app: App, usuarioId: number) => sessaoDe(app, usuarioId, agoraDoTeste);

/** O Pedido padrão: quarta, 11/11, das 14h às 16h (Prazo de decisão às 12h). */
const QUARTA_14H = { inicio: '2026-11-11T14:00:00-03:00', fim: '2026-11-11T16:00:00-03:00' };

function listarPedidos(app: App, usuarioId: number) {
  return app.inject({
    method: 'GET',
    url: '/api/gestao/pedidos',
    cookies: sessao(app, usuarioId),
  });
}

function aprovar(app: App, usuarioId: number, id: number) {
  return app.inject({
    method: 'POST',
    url: `/api/reservas/${id}/aprovacao`,
    cookies: sessao(app, usuarioId),
  });
}

function recusar(app: App, usuarioId: number, id: number, payload: object) {
  return app.inject({
    method: 'POST',
    url: `/api/reservas/${id}/recusa`,
    cookies: sessao(app, usuarioId),
    payload,
  });
}

function abrir(app: App, usuarioId: number, id: number) {
  return app.inject({
    method: 'GET',
    url: `/api/reservas/${id}`,
    cookies: sessao(app, usuarioId),
  });
}

/** O laboratório restrito do Carlos e o Pedido Pendente da Ana nele, na quarta às 14h. */
async function umPedido() {
  const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
  const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
  const laboratorio = await umEspaco(banco, {
    gestorId: carlos.id,
    nome: 'Laboratório de Química',
    restrito: true,
  });
  const pedido = await umaReserva(banco, {
    usuarioId: ana.id,
    recursoId: laboratorio.id,
    ...QUARTA_14H,
    status: 'Pendente',
  });
  return { carlos, ana, laboratorio, pedido };
}

comBanco('US11 · Decidir Pedidos', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('GET /api/gestao/pedidos → só os Pendentes dos Recursos do Gestor, pelo início, com expiraEm, recurso, participantes, finalidade e solicitante', async () => {
    const app = await umaAppAs('10T09:00');
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const dora = await umUsuario(banco, 'Gestor', { nome: 'Dora' });
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const eduardo = await umUsuario(banco, 'Docente', { nome: 'Eduardo' });
    const laboratorio = await umEspaco(banco, {
      gestorId: carlos.id,
      nome: 'Laboratório de Química',
      capacidade: 30,
      restrito: true,
    });
    const camera = await umEquipamento(banco, {
      gestorId: carlos.id,
      nome: 'Câmera 4K',
      restrito: true,
    });
    const daDora = await umEspaco(banco, { gestorId: dora.id, restrito: true });

    // Quinta, 12/11: vem depois na fila.
    const depois = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: laboratorio.id,
      inicio: '2026-11-12T08:00:00-03:00',
      fim: '2026-11-12T10:00:00-03:00',
      participantes: 25,
      finalidade: 'Aula prática de titulação',
      status: 'Pendente',
    });
    // Quarta, 11/11 às 14h: o mais urgente vem primeiro.
    const antes = await umaReserva(banco, {
      usuarioId: eduardo.id,
      recursoId: camera.id,
      ...QUARTA_14H,
      status: 'Pendente',
    });
    // Ficam de fora: já decidida, no Recurso de outro Gestor.
    await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: laboratorio.id,
      inicio: '2026-11-11T08:00:00-03:00',
      fim: '2026-11-11T10:00:00-03:00',
      status: 'Confirmada',
    });
    await umaReserva(banco, { usuarioId: ana.id, recursoId: daDora.id, status: 'Pendente' });

    const resposta = await listarPedidos(app, carlos.id);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([
      {
        id: antes.id,
        inicio: '2026-11-11T14:00:00-03:00',
        fim: '2026-11-11T16:00:00-03:00',
        expiraEm: '2026-11-11T12:00:00-03:00',
        serieId: null,
        reservas: [{ id: antes.id, ...QUARTA_14H }],
        participantes: null,
        finalidade: null,
        recurso: { id: camera.id, nome: 'Câmera 4K', tipo: 'Equipamento', capacidade: null },
        solicitante: {
          id: eduardo.id,
          nome: 'Eduardo',
          perfil: 'Docente',
          penalidades30d: 0,
          suspensoAte: null,
        },
      },
      {
        id: depois.id,
        inicio: '2026-11-12T08:00:00-03:00',
        fim: '2026-11-12T10:00:00-03:00',
        expiraEm: '2026-11-12T06:00:00-03:00',
        serieId: null,
        reservas: [
          { id: depois.id, inicio: '2026-11-12T08:00:00-03:00', fim: '2026-11-12T10:00:00-03:00' },
        ],
        participantes: 25,
        finalidade: 'Aula prática de titulação',
        recurso: {
          id: laboratorio.id,
          nome: 'Laboratório de Química',
          tipo: 'Espaco',
          capacidade: 30,
        },
        solicitante: {
          id: ana.id,
          nome: 'Ana',
          perfil: 'Aluno',
          penalidades30d: 0,
          suspensoAte: null,
        },
      },
    ]);
  });

  it.each(['Aluno', 'Docente'] as const)('GET /api/gestao/pedidos por %s → 403', async (perfil) => {
    const app = await umaAppAs('10T09:00');
    const usuario = await umUsuario(banco, perfil);

    const resposta = await listarPedidos(app, usuario.id);

    expect(resposta.statusCode).toBe(403);
  });

  it('GET /api/gestao/pedidos sem sessão → 401', async () => {
    const app = await umaAppAs('10T09:00');

    const resposta = await app.inject({ method: 'GET', url: '/api/gestao/pedidos' });

    expect(resposta.statusCode).toBe(401);
  });

  it('US11 · na fila, o solicitante vem com as Penalidades dos últimos 30 dias e o "suspenso até" da Suspensão em vigor (RN19)', async () => {
    const app = await umaAppAs('10T09:00');
    const { carlos, ana, laboratorio } = await umPedido();
    const eduardo = await umUsuario(banco, 'Docente', { nome: 'Eduardo' });
    await umaReserva(banco, {
      usuarioId: eduardo.id,
      recursoId: laboratorio.id,
      inicio: '2026-11-12T14:00:00-03:00',
      fim: '2026-11-12T16:00:00-03:00',
      status: 'Pendente',
    });

    // As três faltas da Ana que a suspenderam de 04/11 a 11/11 e uma de mais de 30 dias atrás.
    const suspensao = await banco.suspensao.create({
      data: { usuarioId: ana.id, inicio: as('04T10:15'), fim: as('11T10:15') },
    });
    const faltas = [
      { dia: '2026-10-05', suspensaoId: null },
      { dia: '2026-11-02', suspensaoId: suspensao.id },
      { dia: '2026-11-03', suspensaoId: suspensao.id },
      { dia: '2026-11-04', suspensaoId: suspensao.id },
    ];
    for (const { dia, suspensaoId } of faltas) {
      const falta = await umaReserva(banco, {
        usuarioId: ana.id,
        recursoId: laboratorio.id,
        inicio: `${dia}T10:00:00-03:00`,
        fim: `${dia}T12:00:00-03:00`,
        status: 'NaoComparecimento',
      });
      await banco.penalidade.create({
        data: {
          usuarioId: ana.id,
          reservaId: falta.id,
          motivo: 'NaoComparecimento',
          em: new Date(`${dia}T10:15:00-03:00`),
          suspensaoId,
        },
      });
    }

    const resposta = await listarPedidos(app, carlos.id);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().map((item: { solicitante: object }) => item.solicitante)).toEqual([
      {
        id: ana.id,
        nome: 'Ana',
        perfil: 'Aluno',
        penalidades30d: 3,
        suspensoAte: '2026-11-11T10:15:00-03:00',
      },
      {
        id: eduardo.id,
        nome: 'Eduardo',
        perfil: 'Docente',
        penalidades30d: 0,
        suspensoAte: null,
      },
    ]);
  });

  it('POST /api/reservas/:id/aprovacao pelo Gestor responsável → 200 Confirmada, com quem decidiu no histórico, e o Pedido sai da fila', async () => {
    const app = await umaAppAs('10T09:00');
    const { carlos, ana, laboratorio, pedido } = await umPedido();

    const resposta = await aprovar(app, carlos.id, pedido.id);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      id: pedido.id,
      recursoId: laboratorio.id,
      inicio: '2026-11-11T14:00:00-03:00',
      fim: '2026-11-11T16:00:00-03:00',
      participantes: null,
      finalidade: null,
      status: 'Confirmada',
      criadaEm: '2026-11-01T08:00:00-03:00',
    });
    expect((await abrir(app, ana.id, pedido.id)).json().historico).toEqual([
      {
        de: 'Pendente',
        para: 'Confirmada',
        em: '2026-11-10T09:00:00-03:00',
        por: { id: carlos.id, nome: 'Carlos' },
        observacao: null,
      },
    ]);
    expect((await listarPedidos(app, carlos.id)).json()).toEqual([]);
  });

  it('POST /api/reservas/:id/recusa com justificativa → 200 Recusada, com a justificativa no histórico, e o Intervalo fica livre', async () => {
    const app = await umaAppAs('10T09:00');
    const { carlos, ana, laboratorio, pedido } = await umPedido();
    const bruno = await umUsuario(banco, 'Aluno');

    const resposta = await recusar(app, carlos.id, pedido.id, {
      justificativa: 'Laboratório reservado para a banca de TCC.',
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().status).toBe('Recusada');
    expect((await abrir(app, ana.id, pedido.id)).json().historico).toEqual([
      {
        de: 'Pendente',
        para: 'Recusada',
        em: '2026-11-10T09:00:00-03:00',
        por: { id: carlos.id, nome: 'Carlos' },
        observacao: 'Laboratório reservado para a banca de TCC.',
      },
    ]);

    // RN10: o Gestor recusa o Pedido da Ana → o Bruno pede o mesmo Intervalo e é aceito, Pendente.
    await banco.horarioFuncionamento.create({
      data: { recursoId: laboratorio.id, diaSemana: 3, abre: 7 * 60, fecha: 22 * 60 },
    });
    const novo = await app.inject({
      method: 'POST',
      url: '/api/reservas',
      cookies: sessao(app, bruno.id),
      payload: { recursoId: laboratorio.id, ...QUARTA_14H, participantes: 10 },
    });
    expect(novo.statusCode).toBe(201);
    expect(novo.json().status).toBe('Pendente');
  });

  it('RN11 · Recusa sem justificativa → 422 citando a regra, e o Pedido continua Pendente', async () => {
    const app = await umaAppAs('10T09:00');
    const { carlos, pedido } = await umPedido();

    const resposta = await recusar(app, carlos.id, pedido.id, { justificativa: '   ' });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'regra_violada',
        mensagem: 'Não foi possível concluir: 1 regra impede a operação.',
        violacoes: [
          {
            rn: 'RN11',
            nome: 'Recusa justificada',
            mensagem: 'Escreva a justificativa da Recusa: ela vai na Notificação ao Usuário.',
            campo: 'justificativa',
          },
        ],
      },
    });
    expect((await abrir(app, carlos.id, pedido.id)).json().status).toBe('Pendente');
  });

  it('Recusa sem o campo justificativa → 400', async () => {
    const app = await umaAppAs('10T09:00');
    const { carlos, pedido } = await umPedido();

    const resposta = await recusar(app, carlos.id, pedido.id, {});

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro.codigo).toBe('entrada_invalida');
  });

  it('RN12 · Aprovação de Pedido expirado no Prazo de decisão → 422 citando a regra', async () => {
    const app = await umaAppAs('11T12:00');
    const { carlos, pedido } = await umPedido();

    const resposta = await aprovar(app, carlos.id, pedido.id);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toEqual([
      {
        rn: 'RN12',
        nome: 'Expiração',
        mensagem: 'Este Pedido já expirou.',
      },
    ]);
  });

  it('RN10 · Aprovação de Reserva já Confirmada → 422 citando a regra', async () => {
    const app = await umaAppAs('10T09:00');
    const { carlos, pedido } = await umPedido();
    await aprovar(app, carlos.id, pedido.id);

    const resposta = await aprovar(app, carlos.id, pedido.id);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toEqual([
      {
        rn: 'RN10',
        nome: 'Restrito começa Pendente',
        mensagem: 'Esta Reserva já está Confirmada.',
      },
    ]);
  });

  it('RN13 · outro Gestor tentando aprovar ou recusar → 403 citando a RN13, e o Pedido continua Pendente', async () => {
    const app = await umaAppAs('10T09:00');
    const { carlos, pedido } = await umPedido();
    const dora = await umUsuario(banco, 'Gestor', { nome: 'Dora' });

    const aprovacao = await aprovar(app, dora.id, pedido.id);
    const recusa = await recusar(app, dora.id, pedido.id, { justificativa: 'Não.' });

    for (const resposta of [aprovacao, recusa]) {
      expect(resposta.statusCode).toBe(403);
      expect(resposta.json()).toEqual({
        erro: {
          codigo: 'proibido',
          mensagem:
            'RN13 · Gestor do Recurso: Só o Gestor responsável por este Recurso pode decidir os Pedidos dele.',
          violacoes: [
            {
              rn: 'RN13',
              nome: 'Gestor do Recurso',
              mensagem: 'Só o Gestor responsável por este Recurso pode decidir os Pedidos dele.',
            },
          ],
        },
      });
    }
    expect((await abrir(app, carlos.id, pedido.id)).json().status).toBe('Pendente');
  });

  it.each(['Aluno', 'Docente'] as const)(
    '%s tentando aprovar ou recusar o próprio Pedido → 403',
    async (perfil) => {
      const app = await umaAppAs('10T09:00');
      const usuario = await umUsuario(banco, perfil);
      const { pedido } = await umPedido();
      await banco.reserva.update({ where: { id: pedido.id }, data: { usuarioId: usuario.id } });

      const aprovacao = await aprovar(app, usuario.id, pedido.id);
      const recusa = await recusar(app, usuario.id, pedido.id, { justificativa: 'Desisti.' });

      for (const resposta of [aprovacao, recusa]) {
        expect(resposta.statusCode).toBe(403);
        expect(resposta.json().erro).toMatchObject({
          codigo: 'proibido',
          mensagem: 'Só Gestor pode fazer isto.',
        });
      }
    },
  );

  it('Reserva que não existe → 404', async () => {
    const app = await umaAppAs('10T09:00');
    const carlos = await umUsuario(banco, 'Gestor');

    const aprovacao = await aprovar(app, carlos.id, 999);
    const recusa = await recusar(app, carlos.id, 999, { justificativa: 'Sem técnico.' });

    for (const resposta of [aprovacao, recusa]) {
      expect(resposta.statusCode).toBe(404);
      expect(resposta.json().erro).toMatchObject({
        codigo: 'nao_encontrado',
        mensagem: 'Reserva 999 não encontrada.',
      });
    }
  });

  it('Aprovação e Recusa sem sessão → 401', async () => {
    const app = await umaAppAs('10T09:00');
    const { pedido } = await umPedido();

    const aprovacao = await app.inject({
      method: 'POST',
      url: `/api/reservas/${pedido.id}/aprovacao`,
    });
    const recusa = await app.inject({
      method: 'POST',
      url: `/api/reservas/${pedido.id}/recusa`,
      payload: { justificativa: 'Sem técnico.' },
    });

    expect(aprovacao.statusCode).toBe(401);
    expect(recusa.statusCode).toBe(401);
  });
});

function decidirSerie(
  app: App,
  usuarioId: number,
  serieId: number,
  decisao: 'aprovacao' | 'recusa',
  payload?: object,
) {
  return app.inject({
    method: 'POST',
    url: `/api/series/${serieId}/${decisao}`,
    cookies: sessao(app, usuarioId),
    ...(payload ? { payload } : {}),
  });
}

/** As quartas da Série do Eduardo, das 14h às 16h: 11/11, 18/11 e 25/11 (Prazo de decisão: 11/11, 12h). */
const QUARTAS = ['11', '18', '25'].map((dia) => ({
  inicio: `2026-11-${dia}T14:00:00-03:00`,
  fim: `2026-11-${dia}T16:00:00-03:00`,
}));

/** O laboratório restrito do Carlos e a Série do Eduardo nele, com as três Ocorrências Pendentes. */
async function umaSerie() {
  const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
  const eduardo = await umUsuario(banco, 'Docente', { nome: 'Eduardo' });
  const laboratorio = await umEspaco(banco, {
    gestorId: carlos.id,
    nome: 'Laboratório de Química',
    capacidade: 30,
    restrito: true,
  });
  const serie = await banco.serie.create({
    data: {
      usuarioId: eduardo.id,
      recursoId: laboratorio.id,
      criadaEm: new Date('2026-11-01T08:00:00-03:00'),
    },
  });
  const ocorrencias = [];
  for (const quarta of QUARTAS) {
    ocorrencias.push(
      await umaReserva(banco, {
        usuarioId: eduardo.id,
        recursoId: laboratorio.id,
        serieId: serie.id,
        ...quarta,
        participantes: 20,
        finalidade: 'Aula prática',
        status: 'Pendente',
      }),
    );
  }
  return { carlos, eduardo, laboratorio, serie, ocorrencias };
}

comBanco('US11 · RN21 · Série restrita decidida inteira na fila', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('RN21 · GET /api/gestao/pedidos → a Série é um item só, com as Ocorrências Pendentes, e o Pedido avulso continua como antes', async () => {
    const app = await umaAppAs('10T09:00');
    const { carlos, eduardo, laboratorio, serie, ocorrencias } = await umaSerie();
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const avulso = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: laboratorio.id,
      inicio: '2026-11-12T08:00:00-03:00',
      fim: '2026-11-12T10:00:00-03:00',
      status: 'Pendente',
    });

    const resposta = await listarPedidos(app, carlos.id);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([
      {
        id: ocorrencias[0]!.id,
        serieId: serie.id,
        ...QUARTAS[0],
        expiraEm: '2026-11-11T12:00:00-03:00',
        reservas: ocorrencias.map(({ id }, i) => ({ id, ...QUARTAS[i] })),
        participantes: 20,
        finalidade: 'Aula prática',
        recurso: {
          id: laboratorio.id,
          nome: 'Laboratório de Química',
          tipo: 'Espaco',
          capacidade: 30,
        },
        solicitante: {
          id: eduardo.id,
          nome: 'Eduardo',
          perfil: 'Docente',
          penalidades30d: 0,
          suspensoAte: null,
        },
      },
      expect.objectContaining({
        id: avulso.id,
        serieId: null,
        reservas: [
          {
            id: avulso.id,
            inicio: '2026-11-12T08:00:00-03:00',
            fim: '2026-11-12T10:00:00-03:00',
          },
        ],
      }),
    ]);
  });

  it('RN21 · POST /api/series/:id/aprovacao → 200 com todas as Ocorrências Confirmadas, cada uma com quem decidiu no histórico, e uma Notificação só', async () => {
    const app = await umaAppAs('10T09:00');
    const { carlos, eduardo, laboratorio, serie, ocorrencias } = await umaSerie();

    const resposta = await decidirSerie(app, carlos.id, serie.id, 'aprovacao');

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      reservas: ocorrencias.map(({ id }, i) => ({
        id,
        recursoId: laboratorio.id,
        ...QUARTAS[i],
        participantes: 20,
        finalidade: 'Aula prática',
        status: 'Confirmada',
        criadaEm: '2026-11-01T08:00:00-03:00',
      })),
    });
    for (const { id } of ocorrencias) {
      expect((await abrir(app, eduardo.id, id)).json().historico).toEqual([
        {
          de: 'Pendente',
          para: 'Confirmada',
          em: '2026-11-10T09:00:00-03:00',
          por: { id: carlos.id, nome: 'Carlos' },
          observacao: null,
        },
      ]);
    }
    expect(
      await banco.notificacao.findMany({
        where: { destinatarioId: eduardo.id },
        select: { tipo: true, mensagem: true, reservaId: true },
      }),
    ).toEqual([
      {
        tipo: 'Aprovacao',
        mensagem:
          'Seu Pedido em Série de Laboratório de Química (3 Ocorrências, de 11/11/2026 a 25/11/2026, das 14:00 às 16:00) foi aprovado.',
        reservaId: ocorrencias[0]!.id,
      },
    ]);
    expect((await listarPedidos(app, carlos.id)).json()).toEqual([]);
  });

  it('RN21 · POST /api/series/:id/recusa → 200 com todas as Ocorrências Recusadas, a mesma justificativa em cada uma (RN11)', async () => {
    const app = await umaAppAs('10T09:00');
    const { carlos, eduardo, serie, ocorrencias } = await umaSerie();

    const resposta = await decidirSerie(app, carlos.id, serie.id, 'recusa', {
      justificativa: 'Laboratório em reforma no semestre.',
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().reservas.map(({ status }: { status: string }) => status)).toEqual([
      'Recusada',
      'Recusada',
      'Recusada',
    ]);
    for (const { id } of ocorrencias) {
      expect((await abrir(app, eduardo.id, id)).json().historico).toEqual([
        {
          de: 'Pendente',
          para: 'Recusada',
          em: '2026-11-10T09:00:00-03:00',
          por: { id: carlos.id, nome: 'Carlos' },
          observacao: 'Laboratório em reforma no semestre.',
        },
      ]);
    }
    const notificacoes = await banco.notificacao.findMany({
      where: { destinatarioId: eduardo.id },
    });
    expect(notificacoes).toHaveLength(1);
    expect(notificacoes[0]).toMatchObject({
      tipo: 'Recusa',
      mensagem:
        'Seu Pedido em Série de Laboratório de Química (3 Ocorrências, de 11/11/2026 a 25/11/2026, das 14:00 às 16:00) foi recusado: Laboratório em reforma no semestre.',
    });
  });

  it('RN11 · Recusa da Série sem justificativa → 422, e as Ocorrências continuam Pendentes', async () => {
    const app = await umaAppAs('10T09:00');
    const { carlos, serie, ocorrencias } = await umaSerie();

    const resposta = await decidirSerie(app, carlos.id, serie.id, 'recusa', {
      justificativa: '  ',
    });
    const semCampo = await decidirSerie(app, carlos.id, serie.id, 'recusa', {});

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toMatchObject([{ rn: 'RN11', campo: 'justificativa' }]);
    expect(semCampo.statusCode).toBe(400);
    for (const { id } of ocorrencias) {
      expect((await abrir(app, carlos.id, id)).json().status).toBe('Pendente');
    }
  });

  it('RN21 · aprovar ou recusar uma Ocorrência sozinha pelas rotas da Reserva → 422 citando a RN21, e a Série continua Pendente', async () => {
    const app = await umaAppAs('10T09:00');
    const { carlos, ocorrencias } = await umaSerie();
    const segunda = ocorrencias[1]!;

    const aprovacao = await aprovar(app, carlos.id, segunda.id);
    const recusa = await recusar(app, carlos.id, segunda.id, { justificativa: 'Só esta data.' });

    for (const resposta of [aprovacao, recusa]) {
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json().erro.violacoes).toEqual([
        {
          rn: 'RN21',
          nome: 'Série tudo-ou-nada',
          mensagem: 'Esta Ocorrência é de uma Série: aprove ou recuse a Série inteira, na fila.',
        },
      ]);
    }
    for (const { id } of ocorrencias) {
      expect((await abrir(app, carlos.id, id)).json().status).toBe('Pendente');
    }
  });

  it('RN12 · no Prazo de decisão da primeira Ocorrência, o sincronizar expira a Série inteira e a Aprovação dela → 422', async () => {
    const app = await umaAppAs('11T12:00');
    const { carlos, eduardo, serie, ocorrencias } = await umaSerie();

    const resposta = await decidirSerie(app, carlos.id, serie.id, 'aprovacao');

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toEqual([
      { rn: 'RN12', nome: 'Expiração', mensagem: 'Esta Série já expirou.' },
    ]);
    for (const { id } of ocorrencias) {
      expect((await abrir(app, eduardo.id, id)).json().status).toBe('Expirada');
    }
    expect((await listarPedidos(app, carlos.id)).json()).toEqual([]);
  });

  it('RN13 · outro Gestor decidindo a Série → 403, e as Ocorrências continuam Pendentes', async () => {
    const app = await umaAppAs('10T09:00');
    const { carlos, serie, ocorrencias } = await umaSerie();
    const dora = await umUsuario(banco, 'Gestor', { nome: 'Dora' });

    const aprovacao = await decidirSerie(app, dora.id, serie.id, 'aprovacao');
    const recusa = await decidirSerie(app, dora.id, serie.id, 'recusa', { justificativa: 'Não.' });

    for (const resposta of [aprovacao, recusa]) {
      expect(resposta.statusCode).toBe(403);
      expect(resposta.json().erro.violacoes).toMatchObject([{ rn: 'RN13' }]);
    }
    for (const { id } of ocorrencias) {
      expect((await abrir(app, carlos.id, id)).json().status).toBe('Pendente');
    }
  });

  it('o próprio Docente tentando aprovar a Série → 403', async () => {
    const app = await umaAppAs('10T09:00');
    const { eduardo, serie } = await umaSerie();

    const resposta = await decidirSerie(app, eduardo.id, serie.id, 'aprovacao');

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json().erro.mensagem).toBe('Só Gestor pode fazer isto.');
  });

  it('Série que não existe → 404; sem sessão → 401', async () => {
    const app = await umaAppAs('10T09:00');
    const carlos = await umUsuario(banco, 'Gestor');

    const aprovacao = await decidirSerie(app, carlos.id, 999, 'aprovacao');
    const recusa = await decidirSerie(app, carlos.id, 999, 'recusa', { justificativa: 'Não.' });
    const semSessao = await app.inject({ method: 'POST', url: '/api/series/999/aprovacao' });

    for (const resposta of [aprovacao, recusa]) {
      expect(resposta.statusCode).toBe(404);
      expect(resposta.json().erro).toMatchObject({
        codigo: 'nao_encontrado',
        mensagem: 'Série 999 não encontrada.',
      });
    }
    expect(semSessao.statusCode).toBe(401);
  });
});
