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
  umUsuario,
} from '../../../teste/banco';

let banco: Banco;

type App = Awaited<ReturnType<typeof umaApp>>;

/** Terça, 10/11/2026, em São Paulo: o dia da Reserva padrão das fábricas (10h–12h). */
const as = (hora: string) => new Date(`2026-11-10T${hora}:00-03:00`);

/** A app com o relógio parado na `hora` da terça. */
const umaAppAs = (hora: string) => umaApp({ banco, relogio: new RelogioFixo(as(hora)) });

function fazerCheckIn(app: App, usuarioId: number, id: number) {
  return app.inject({
    method: 'POST',
    url: `/api/reservas/${id}/check-in`,
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

comBanco('US12 · Fazer Check-in', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('a dona, às 9h50 da Reserva das 10h → 200 Em uso, com o Check-in dela no histórico', async () => {
    const app = await umaAppAs('09:50');
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const reserva = await umaReserva(banco, { usuarioId: ana.id });

    const resposta = await fazerCheckIn(app, ana.id, reserva.id);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      id: reserva.id,
      recursoId: reserva.recursoId,
      inicio: '2026-11-10T10:00:00-03:00',
      fim: '2026-11-10T12:00:00-03:00',
      participantes: null,
      finalidade: null,
      status: 'EmUso',
      criadaEm: '2026-11-01T08:00:00-03:00',
    });
    expect((await abrir(app, ana.id, reserva.id)).json().historico).toEqual([
      {
        de: 'Confirmada',
        para: 'EmUso',
        em: '2026-11-10T09:50:00-03:00',
        por: { id: ana.id, nome: 'Ana' },
        observacao: null,
      },
    ]);
  });

  it('no Equipamento, o Check-in é a retirada e vale igual', async () => {
    const app = await umaAppAs('10:14');
    const bia = await umUsuario(banco);
    const notebook = await umEquipamento(banco);
    const reserva = await umaReserva(banco, { usuarioId: bia.id, recursoId: notebook.id });

    const resposta = await fazerCheckIn(app, bia.id, reserva.id);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().status).toBe('EmUso');
  });

  it('RN14 · às 9h40, antes da janela → 422 citando a regra, e a Reserva continua Confirmada', async () => {
    const app = await umaAppAs('09:40');
    const ana = await umUsuario(banco);
    const reserva = await umaReserva(banco, { usuarioId: ana.id });

    const resposta = await fazerCheckIn(app, ana.id, reserva.id);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'regra_violada',
        mensagem: 'Não foi possível concluir: 1 regra impede a operação.',
        violacoes: [
          {
            rn: 'RN14',
            nome: 'Janela de Check-in',
            mensagem: 'O Check-in abre às 09:45, 15 minutos antes do início.',
          },
        ],
      },
    });
    expect((await abrir(app, ana.id, reserva.id)).json()).toMatchObject({
      status: 'Confirmada',
      historico: [],
    });
  });

  it('RN14 · Reserva Expirada, na janela → 422 citando a regra', async () => {
    const app = await umaAppAs('09:50');
    const ana = await umUsuario(banco);
    const reserva = await umaReserva(banco, { usuarioId: ana.id, status: 'Pendente' });

    const resposta = await fazerCheckIn(app, ana.id, reserva.id);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toEqual([
      {
        rn: 'RN14',
        nome: 'Janela de Check-in',
        mensagem: 'Esta Reserva já foi encerrada e não aceita mais Check-in.',
      },
    ]);
  });

  it('RN14 · outra pessoa → 403 citando a regra, e a Reserva continua Confirmada', async () => {
    const app = await umaAppAs('09:50');
    const ana = await umUsuario(banco);
    const bruno = await umUsuario(banco);
    const reserva = await umaReserva(banco, { usuarioId: ana.id });

    const resposta = await fazerCheckIn(app, bruno.id, reserva.id);

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'proibido',
        mensagem: 'RN14 · Janela de Check-in: Só quem fez a Reserva pode fazer o Check-in dela.',
        violacoes: [
          {
            rn: 'RN14',
            nome: 'Janela de Check-in',
            mensagem: 'Só quem fez a Reserva pode fazer o Check-in dela.',
          },
        ],
      },
    });
    expect((await abrir(app, ana.id, reserva.id)).json().status).toBe('Confirmada');
  });

  it('Reserva que não existe → 404', async () => {
    const app = await umaAppAs('09:50');
    const ana = await umUsuario(banco);

    const resposta = await fazerCheckIn(app, ana.id, 999);

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json().erro).toMatchObject({
      codigo: 'nao_encontrado',
      mensagem: 'Reserva 999 não encontrada.',
    });
  });

  it('sem sessão → 401', async () => {
    const app = await umaAppAs('09:50');
    const reserva = await umaReserva(banco);

    const resposta = await app.inject({
      method: 'POST',
      url: `/api/reservas/${reserva.id}/check-in`,
    });

    expect(resposta.statusCode).toBe(401);
  });

  it('RN23 · com a Reserva anterior do Notebook sem Devolução → 422 citando a regra; depois da Devolução, o Check-in segue normal', async () => {
    const relogio = new RelogioFixo(as('09:50'));
    const app = await umaApp({ banco, relogio });
    const carlos = await umUsuario(banco, 'Gestor');
    const eduardo = await umUsuario(banco, 'Docente');
    const bia = await umUsuario(banco);
    const notebook = await umEquipamento(banco, { gestorId: carlos.id });
    const doEduardo = await umaReserva(banco, {
      usuarioId: eduardo.id,
      recursoId: notebook.id,
      inicio: '2026-11-10T08:00:00-03:00',
      fim: '2026-11-10T10:00:00-03:00',
      status: 'EmUso',
    });
    const daBia = await umaReserva(banco, { usuarioId: bia.id, recursoId: notebook.id });

    const recusado = await fazerCheckIn(app, bia.id, daBia.id);

    expect(recusado.statusCode).toBe(422);
    expect(recusado.json().erro.violacoes).toEqual([
      {
        rn: 'RN23',
        nome: 'Equipamento ainda fora',
        mensagem:
          'O Equipamento ainda não foi devolvido pela Reserva anterior. Se ele não voltar até as 10:15, no fim da Tolerância, esta Reserva será cancelada sem Penalidade.',
      },
    ]);
    expect((await abrir(app, bia.id, daBia.id)).json().status).toBe('Confirmada');

    relogio.ir(as('10:05'));
    const devolucao = await app.inject({
      method: 'POST',
      url: `/api/reservas/${doEduardo.id}/devolucao`,
      cookies: sessaoDe(app, carlos.id),
      payload: {},
    });
    expect(devolucao.statusCode).toBe(200);

    const aceito = await fazerCheckIn(app, bia.id, daBia.id);
    expect(aceito.statusCode).toBe(200);
    expect(aceito.json().status).toBe('EmUso');
  });

  it('RN23 · a Reserva Em uso de outro Equipamento não segura o Check-in', async () => {
    const app = await umaAppAs('09:50');
    const bia = await umUsuario(banco);
    const notebook = await umEquipamento(banco);
    const outro = await umEquipamento(banco);
    await umaReserva(banco, {
      recursoId: outro.id,
      inicio: '2026-11-10T08:00:00-03:00',
      fim: '2026-11-10T10:00:00-03:00',
      status: 'EmUso',
    });
    const daBia = await umaReserva(banco, { usuarioId: bia.id, recursoId: notebook.id });

    expect((await fazerCheckIn(app, bia.id, daBia.id)).statusCode).toBe(200);
  });
});
