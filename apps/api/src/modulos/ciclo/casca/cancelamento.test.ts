import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from '../../../comum/banco';
import { RelogioFixo } from '../../../comum/relogio';
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

/** Terça, 10/11/2026, em São Paulo: o dia da Reserva padrão das fábricas (10h–12h). */
const as = (hora: string) => new Date(`2026-11-10T${hora}:00-03:00`);

/** A app com o relógio parado na `hora` da terça. */
const umaAppAs = (hora: string) => umaApp({ banco, relogio: new RelogioFixo(as(hora)) });

function cancelar(app: App, usuarioId: number, id: number) {
  return app.inject({
    method: 'POST',
    url: `/api/reservas/${id}/cancelamento`,
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

comBanco('US13 · Cancelar', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('a dona cancela a Reserva Confirmada antes do início → 200 { reserva, penalidade: null }, com a transição no histórico e liberando o Recurso', async () => {
    const app = await umaAppAs('09:30');
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const bruno = await umUsuario(banco, 'Aluno');
    const lab = await umEspaco(banco, {
      horarios: { create: [{ diaSemana: 2, abre: 7 * 60, fecha: 23 * 60 }] },
    });
    const reserva = await umaReserva(banco, { usuarioId: ana.id, recursoId: lab.id });

    const resposta = await cancelar(app, ana.id, reserva.id);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      reserva: {
        id: reserva.id,
        recursoId: lab.id,
        inicio: '2026-11-10T10:00:00-03:00',
        fim: '2026-11-10T12:00:00-03:00',
        participantes: null,
        finalidade: null,
        status: 'Cancelada',
        criadaEm: '2026-11-01T08:00:00-03:00',
      },
      penalidade: null,
    });
    expect((await abrir(app, ana.id, reserva.id)).json().historico).toEqual([
      {
        de: 'Confirmada',
        para: 'Cancelada',
        em: '2026-11-10T09:30:00-03:00',
        por: { id: ana.id, nome: 'Ana' },
        observacao: null,
      },
    ]);

    // O Intervalo ficou livre para outra Reserva (RN01). Começa às 10:30, sobre a cancelada, pela
    // Antecedência mínima de 1h (RN05).
    const nova = await app.inject({
      method: 'POST',
      url: '/api/reservas',
      cookies: sessaoDe(app, bruno.id),
      payload: {
        recursoId: lab.id,
        inicio: '2026-11-10T10:30:00-03:00',
        fim: '2026-11-10T12:00:00-03:00',
        participantes: 20,
      },
    });
    expect(nova.statusCode).toBe(201);
  });

  it('a dona também cancela uma Reserva Pendente → 200 Cancelada, sem Penalidade', async () => {
    const app = await umaAppAs('09:30');
    const ana = await umUsuario(banco);
    const reserva = await umaReserva(banco, {
      usuarioId: ana.id,
      status: 'Pendente',
      inicio: '2026-11-10T14:00:00-03:00',
      fim: '2026-11-10T16:00:00-03:00',
    });

    const resposta = await cancelar(app, ana.id, reserva.id);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      reserva: { id: reserva.id, status: 'Cancelada' },
      penalidade: null,
    });
  });

  it('RN16 · no início ou depois → 422 citando a regra, e a Reserva continua Confirmada', async () => {
    const app = await umaAppAs('10:00');
    const ana = await umUsuario(banco);
    const reserva = await umaReserva(banco, { usuarioId: ana.id });

    const resposta = await cancelar(app, ana.id, reserva.id);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'regra_violada',
        mensagem: 'Não foi possível concluir: 1 regra impede a operação.',
        violacoes: [
          {
            rn: 'RN16',
            nome: 'Cancelamento',
            mensagem: 'A Reserva só pode ser cancelada antes do início (10:00).',
          },
        ],
      },
    });
    expect((await abrir(app, ana.id, reserva.id)).json()).toMatchObject({
      status: 'Confirmada',
      historico: [],
    });
  });

  it('RN16 · Reserva já Cancelada → 422 citando a regra', async () => {
    const app = await umaAppAs('09:30');
    const ana = await umUsuario(banco);
    const reserva = await umaReserva(banco, { usuarioId: ana.id, status: 'Cancelada' });

    const resposta = await cancelar(app, ana.id, reserva.id);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toEqual([
      {
        rn: 'RN16',
        nome: 'Cancelamento',
        mensagem: 'Esta Reserva já foi cancelada.',
      },
    ]);
  });

  it('RN16 · outra pessoa → 403 citando a regra, e a Reserva continua Confirmada', async () => {
    const app = await umaAppAs('09:30');
    const ana = await umUsuario(banco);
    const bruno = await umUsuario(banco);
    const reserva = await umaReserva(banco, { usuarioId: ana.id });

    const resposta = await cancelar(app, bruno.id, reserva.id);

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'proibido',
        mensagem: 'RN16 · Cancelamento: Só quem fez a Reserva pode cancelá-la.',
        violacoes: [
          {
            rn: 'RN16',
            nome: 'Cancelamento',
            mensagem: 'Só quem fez a Reserva pode cancelá-la.',
          },
        ],
      },
    });
    expect((await abrir(app, ana.id, reserva.id)).json().status).toBe('Confirmada');
  });

  it('Reserva que não existe → 404', async () => {
    const app = await umaAppAs('09:30');
    const ana = await umUsuario(banco);

    const resposta = await cancelar(app, ana.id, 999);

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json().erro).toMatchObject({
      codigo: 'nao_encontrado',
      mensagem: 'Reserva 999 não encontrada.',
    });
  });

  it('sem sessão → 401', async () => {
    const app = await umaAppAs('09:30');
    const reserva = await umaReserva(banco);

    const resposta = await app.inject({
      method: 'POST',
      url: `/api/reservas/${reserva.id}/cancelamento`,
    });

    expect(resposta.statusCode).toBe(401);
  });
});
