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
        participantes: null,
        finalidade: null,
        recurso: { id: camera.id, nome: 'Câmera 4K', tipo: 'Equipamento', capacidade: null },
        solicitante: { id: eduardo.id, nome: 'Eduardo', perfil: 'Docente' },
      },
      {
        id: depois.id,
        inicio: '2026-11-12T08:00:00-03:00',
        fim: '2026-11-12T10:00:00-03:00',
        expiraEm: '2026-11-12T06:00:00-03:00',
        participantes: 25,
        finalidade: 'Aula prática de titulação',
        recurso: {
          id: laboratorio.id,
          nome: 'Laboratório de Química',
          tipo: 'Espaco',
          capacidade: 30,
        },
        solicitante: { id: ana.id, nome: 'Ana', perfil: 'Aluno' },
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

  it('RN12 · Aprovação no Prazo de decisão (2h antes do início) → 422 citando a regra', async () => {
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
