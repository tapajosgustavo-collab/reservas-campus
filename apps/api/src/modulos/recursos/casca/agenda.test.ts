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

// O agora da `umaApp` é terça, 10/11/2026, 8h: a semana dele começa na segunda, 09/11.

/** Laboratório aberto de segunda a sexta, das 7h às 23h, com o Bruno e a Ana de Alunos. */
async function cenario() {
  const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
  const lab = await umEspaco(banco, {
    gestorId: carlos.id,
    nome: 'Laboratório 3',
    local: 'Bloco A',
    capacidade: 30,
    horarios: {
      create: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: 7 * 60, fecha: 23 * 60 })),
    },
  });
  const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
  const bruno = await umUsuario(banco, 'Aluno', { nome: 'Bruno' });
  return { carlos, lab, ana, bruno };
}

comBanco('US07 · Agenda do Recurso', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('RN22 · Ana abre a agenda e vê a Reserva do Bruno só com início e fim', async () => {
    const app = await umaApp({ banco });
    const { carlos, lab, ana, bruno } = await cenario();
    await umaReserva(banco, { usuarioId: bruno.id, recursoId: lab.id, finalidade: 'Estudo' });

    const resposta = await app.inject({
      method: 'GET',
      url: `/api/recursos/${lab.id}/agenda?semana=2026-11-09`,
      cookies: sessaoDe(app, ana.id),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      agora: '2026-11-10T08:00:00-03:00',
      semana: '2026-11-09',
      recurso: {
        id: lab.id,
        tipo: 'Espaco',
        nome: 'Laboratório 3',
        local: 'Bloco A',
        capacidade: 30,
        patrimonio: null,
        gestor: { id: carlos.id, nome: 'Carlos' },
        horarios: [1, 2, 3, 4, 5].map((diaSemana) => ({
          diaSemana,
          abre: 7 * 60,
          fecha: 23 * 60,
        })),
      },
      indisponibilidades: [],
      ocupacoes: [{ inicio: '2026-11-10T10:00:00-03:00', fim: '2026-11-10T12:00:00-03:00' }],
    });
  });

  it('RN22 · Bruno vê a própria Reserva com minha, reservaId e status', async () => {
    const app = await umaApp({ banco });
    const { lab, bruno } = await cenario();
    const reserva = await umaReserva(banco, {
      usuarioId: bruno.id,
      recursoId: lab.id,
      status: 'Pendente',
    });

    const resposta = await app.inject({
      method: 'GET',
      url: `/api/recursos/${lab.id}/agenda?semana=2026-11-09`,
      cookies: sessaoDe(app, bruno.id),
    });

    expect(resposta.json().ocupacoes).toEqual([
      {
        inicio: '2026-11-10T10:00:00-03:00',
        fim: '2026-11-10T12:00:00-03:00',
        minha: true,
        reservaId: reserva.id,
        status: 'Pendente',
      },
    ]);
  });

  it('só as Reservas ativas deste Recurso na semana pedida, por início', async () => {
    const app = await umaApp({ banco });
    const { lab, ana, bruno } = await cenario();
    const doBruno = { usuarioId: bruno.id, recursoId: lab.id };
    await umaReserva(banco, {
      ...doBruno,
      inicio: '2026-11-13T14:00:00-03:00',
      fim: '2026-11-13T15:00:00-03:00',
      status: 'EmUso',
    });
    await umaReserva(banco, doBruno);
    await umaReserva(banco, { ...doBruno, status: 'Cancelada' });
    // Na segunda seguinte, à meia-noite, e no domingo anterior: fora da semana.
    await umaReserva(banco, {
      ...doBruno,
      inicio: '2026-11-16T00:00:00-03:00',
      fim: '2026-11-16T01:00:00-03:00',
    });
    await umaReserva(banco, {
      ...doBruno,
      inicio: '2026-11-08T22:00:00-03:00',
      fim: '2026-11-08T23:00:00-03:00',
    });
    await umaReserva(banco, { usuarioId: bruno.id });

    const resposta = await app.inject({
      method: 'GET',
      url: `/api/recursos/${lab.id}/agenda?semana=2026-11-09`,
      cookies: sessaoDe(app, ana.id),
    });

    expect(resposta.json().ocupacoes).toEqual([
      { inicio: '2026-11-10T10:00:00-03:00', fim: '2026-11-10T12:00:00-03:00' },
      { inicio: '2026-11-13T14:00:00-03:00', fim: '2026-11-13T15:00:00-03:00' },
    ]);
  });

  it('sem semana, a agenda é a da semana do agora da API', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();

    const resposta = await app.inject({
      method: 'GET',
      url: `/api/recursos/${lab.id}/agenda`,
      cookies: sessaoDe(app, ana.id),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      agora: '2026-11-10T08:00:00-03:00',
      semana: '2026-11-09',
    });
  });

  it('?semana=2026-11-16 → a semana seguinte', async () => {
    const app = await umaApp({ banco });
    const { lab, ana, bruno } = await cenario();
    await umaReserva(banco, { usuarioId: bruno.id, recursoId: lab.id });
    await umaReserva(banco, {
      usuarioId: bruno.id,
      recursoId: lab.id,
      inicio: '2026-11-17T10:00:00-03:00',
      fim: '2026-11-17T11:00:00-03:00',
    });

    const resposta = await app.inject({
      method: 'GET',
      url: `/api/recursos/${lab.id}/agenda?semana=2026-11-16`,
      cookies: sessaoDe(app, ana.id),
    });

    expect(resposta.json()).toMatchObject({
      semana: '2026-11-16',
      ocupacoes: [{ inicio: '2026-11-17T10:00:00-03:00', fim: '2026-11-17T11:00:00-03:00' }],
    });
  });

  it('semana que não começa na segunda → 400', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();

    const resposta = await app.inject({
      method: 'GET',
      url: `/api/recursos/${lab.id}/agenda?semana=2026-11-10`,
      cookies: sessaoDe(app, ana.id),
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro.mensagem).toContain('a semana começa na segunda-feira');
  });

  it('Recurso que não existe → 404', async () => {
    const app = await umaApp({ banco });
    const ana = await umUsuario(banco);

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/recursos/999/agenda',
      cookies: sessaoDe(app, ana.id),
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('RN04 · a agenda mostra a Indisponibilidade com o motivo, só as que tocam a semana', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();
    const indisponibilidade = (inicio: string, fim: string | null, motivo: string) =>
      banco.indisponibilidade.create({
        data: {
          recursoId: lab.id,
          inicio: new Date(inicio),
          fim: fim && new Date(fim),
          motivo,
          criadaEm: new Date('2026-11-01T08:00:00-03:00'),
        },
      });
    await indisponibilidade('2026-11-02T08:00:00-03:00', '2026-11-03T08:00:00-03:00', 'Antiga');
    await indisponibilidade('2026-11-11T08:00:00-03:00', '2026-11-11T12:00:00-03:00', 'Pintura');
    await indisponibilidade('2026-11-13T18:00:00-03:00', null, 'Fora de uso');

    const resposta = await app.inject({
      method: 'GET',
      url: `/api/recursos/${lab.id}/agenda?semana=2026-11-09`,
      cookies: sessaoDe(app, ana.id),
    });

    expect(resposta.json().indisponibilidades).toEqual([
      { inicio: '2026-11-11T08:00:00-03:00', fim: '2026-11-11T12:00:00-03:00', motivo: 'Pintura' },
      { inicio: '2026-11-13T18:00:00-03:00', fim: null, motivo: 'Fora de uso' },
    ]);
  });

  it('sem sessão → 401', async () => {
    const app = await umaApp({ banco });
    const { lab } = await cenario();

    const resposta = await app.inject({ method: 'GET', url: `/api/recursos/${lab.id}/agenda` });

    expect(resposta.statusCode).toBe(401);
  });
});
