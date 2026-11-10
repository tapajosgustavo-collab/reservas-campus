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

/** Terça, 10/11/2026, em São Paulo: o dia da Reserva padrão das fábricas (10h–12h). */
const as = (hora: string) => new Date(`2026-11-10T${hora}:00-03:00`);

/** A app com o relógio parado na `hora` da terça. */
const umaAppAs = (hora: string) => umaApp({ banco, relogio: new RelogioFixo(as(hora)) });

function listarEmUso(app: App, usuarioId: number) {
  return app.inject({
    method: 'GET',
    url: '/api/gestao/em-uso',
    cookies: sessaoDe(app, usuarioId),
  });
}

function devolver(
  app: App,
  usuarioId: number,
  id: number,
  payload: { observacao?: string; extraviado?: boolean } = {},
) {
  return app.inject({
    method: 'POST',
    url: `/api/reservas/${id}/devolucao`,
    cookies: sessaoDe(app, usuarioId),
    payload,
  });
}

function abrir(app: App, usuarioId: number, id: number) {
  return app.inject({
    method: 'GET',
    url: `/api/reservas/${id}`,
    cookies: sessaoDe(app, usuarioId),
  });
}

comBanco('US14 · Em uso e Registrar Devolução', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('GET /api/gestao/em-uso → só as Reservas Em uso dos Equipamentos do Gestor, por fim, com devolucaoAtrasada e usuario', async () => {
    // Às 12h15, uma Reserva que terminou às 12h00 já está em Devolução atrasada (RN17), e uma que
    // termina às 13h00 ainda não.
    const app = await umaAppAs('12:15');
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const dora = await umUsuario(banco, 'Gestor', { nome: 'Dora' });
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const eduardo = await umUsuario(banco, 'Docente', { nome: 'Eduardo' });

    const p123 = await umEquipamento(banco, {
      gestorId: carlos.id,
      nome: 'Projetor Epson',
      patrimonio: 'P-123',
    });
    const n01 = await umEquipamento(banco, {
      gestorId: carlos.id,
      nome: 'Notebook Dell',
      patrimonio: 'N-01',
    });
    const salaDoCarlos = await umEspaco(banco, { gestorId: carlos.id, nome: 'Sala 101' });
    const daDora = await umEquipamento(banco, { gestorId: dora.id, patrimonio: 'P-999' });

    // Termina às 13h (vem depois na lista) — ainda no prazo às 12h15.
    const noPrazo = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: p123.id,
      inicio: '2026-11-10T11:00:00-03:00',
      fim: '2026-11-10T13:00:00-03:00',
      status: 'EmUso',
    });
    // Terminou às 12h (vem primeiro na lista) — às 12h15 já passou da Tolerância de Devolução.
    const atrasada = await umaReserva(banco, {
      usuarioId: eduardo.id,
      recursoId: n01.id,
      inicio: '2026-11-10T10:00:00-03:00',
      fim: '2026-11-10T12:00:00-03:00',
      status: 'EmUso',
    });
    // Ficam de fora: Confirmada, Concluída, Espaço Em uso e Equipamento de outro Gestor.
    await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: p123.id,
      inicio: '2026-11-10T14:00:00-03:00',
      fim: '2026-11-10T16:00:00-03:00',
      status: 'Confirmada',
    });
    await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: p123.id,
      inicio: '2026-11-10T08:00:00-03:00',
      fim: '2026-11-10T10:00:00-03:00',
      status: 'Concluida',
    });
    await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: salaDoCarlos.id,
      status: 'EmUso',
    });
    await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: daDora.id,
      status: 'EmUso',
    });

    const resposta = await listarEmUso(app, carlos.id);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([
      {
        id: atrasada.id,
        inicio: '2026-11-10T10:00:00-03:00',
        fim: '2026-11-10T12:00:00-03:00',
        devolucaoAtrasada: true,
        recurso: { id: n01.id, nome: 'Notebook Dell', patrimonio: 'N-01' },
        usuario: { id: eduardo.id, nome: 'Eduardo' },
      },
      {
        id: noPrazo.id,
        inicio: '2026-11-10T11:00:00-03:00',
        fim: '2026-11-10T13:00:00-03:00',
        devolucaoAtrasada: false,
        recurso: { id: p123.id, nome: 'Projetor Epson', patrimonio: 'P-123' },
        usuario: { id: ana.id, nome: 'Ana' },
      },
    ]);
  });

  it.each(['Aluno', 'Docente'] as const)('GET /api/gestao/em-uso por %s → 403', async (perfil) => {
    const app = await umaAppAs('12:00');
    const usuario = await umUsuario(banco, perfil);

    const resposta = await listarEmUso(app, usuario.id);

    expect(resposta.statusCode).toBe(403);
  });

  it('GET /api/gestao/em-uso sem sessão → 401', async () => {
    const app = await umaAppAs('12:00');

    const resposta = await app.inject({ method: 'GET', url: '/api/gestao/em-uso' });

    expect(resposta.statusCode).toBe(401);
  });

  it('POST /api/reservas/:id/devolucao pelo Gestor responsável → 200 Concluída, com a transição e a observação no histórico', async () => {
    const app = await umaAppAs('12:10');
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const p123 = await umEquipamento(banco, { gestorId: carlos.id });
    const reserva = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: p123.id,
      status: 'EmUso',
    });

    const resposta = await devolver(app, carlos.id, reserva.id, {
      observacao: 'Devolvido com controle remoto.',
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      id: reserva.id,
      recursoId: p123.id,
      inicio: '2026-11-10T10:00:00-03:00',
      fim: '2026-11-10T12:00:00-03:00',
      participantes: null,
      finalidade: null,
      status: 'Concluida',
      criadaEm: '2026-11-01T08:00:00-03:00',
    });
    expect((await abrir(app, ana.id, reserva.id)).json().historico).toEqual([
      {
        de: 'EmUso',
        para: 'Concluida',
        em: '2026-11-10T12:10:00-03:00',
        por: { id: carlos.id, nome: 'Carlos' },
        observacao: 'Devolvido com controle remoto.',
      },
    ]);
  });

  it('RN17 · Devolução antecipada: Reserva 10h–14h devolvida às 11h → Concluída na hora, sem Penalidade, liberando o trecho 12h–14h', async () => {
    const app = await umaAppAs('11:00');
    const carlos = await umUsuario(banco, 'Gestor');
    const ana = await umUsuario(banco, 'Aluno');
    const bruno = await umUsuario(banco, 'Aluno');
    const p123 = await umEquipamento(banco, {
      gestorId: carlos.id,
      horarios: { create: [{ diaSemana: 2, abre: 7 * 60, fecha: 22 * 60 }] },
    });
    const reserva = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: p123.id,
      inicio: '2026-11-10T10:00:00-03:00',
      fim: '2026-11-10T14:00:00-03:00',
      status: 'EmUso',
    });

    const resposta = await devolver(app, carlos.id, reserva.id);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().status).toBe('Concluida');
    expect(await banco.penalidade.count()).toBe(0);

    // O trecho 12h–14h (dentro da Antecedência mínima de 1h a partir das 11h) ficou livre (RN01).
    const nova = await app.inject({
      method: 'POST',
      url: '/api/reservas',
      cookies: sessaoDe(app, bruno.id),
      payload: {
        recursoId: p123.id,
        inicio: '2026-11-10T12:00:00-03:00',
        fim: '2026-11-10T14:00:00-03:00',
      },
    });
    expect(nova.statusCode).toBe(201);
  });

  it('RN17 · Equipamento perdido ou roubado sem observação → 422 citando a regra, e a Reserva continua Em uso', async () => {
    const app = await umaAppAs('12:10');
    const carlos = await umUsuario(banco, 'Gestor');
    const p123 = await umEquipamento(banco, { gestorId: carlos.id });
    const reserva = await umaReserva(banco, { recursoId: p123.id, status: 'EmUso' });

    const resposta = await devolver(app, carlos.id, reserva.id, { extraviado: true });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'regra_violada',
        mensagem: 'Não foi possível concluir: 1 regra impede a operação.',
        violacoes: [
          {
            rn: 'RN17',
            nome: 'Devolução atrasada',
            mensagem: 'Informe uma observação explicando a perda ou o roubo do Equipamento.',
            campo: 'observacao',
          },
        ],
      },
    });
    expect((await abrir(app, carlos.id, reserva.id)).json().status).toBe('EmUso');
  });

  it('RN17 · Reserva Confirmada (ainda sem Check-in) → 422 citando a regra', async () => {
    const app = await umaAppAs('12:10');
    const carlos = await umUsuario(banco, 'Gestor');
    const p123 = await umEquipamento(banco, { gestorId: carlos.id });
    const reserva = await umaReserva(banco, { recursoId: p123.id, status: 'Confirmada' });

    const resposta = await devolver(app, carlos.id, reserva.id);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toEqual([
      {
        rn: 'RN17',
        nome: 'Devolução atrasada',
        mensagem: 'Esta Reserva ainda não está em uso.',
      },
    ]);
  });

  it('RN13 · outro Gestor tentando registrar a Devolução → 403 citando a RN13, e a Reserva continua Em uso', async () => {
    const app = await umaAppAs('12:10');
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const dora = await umUsuario(banco, 'Gestor', { nome: 'Dora' });
    const p123 = await umEquipamento(banco, { gestorId: carlos.id, patrimonio: 'P-123' });
    const reserva = await umaReserva(banco, { recursoId: p123.id, status: 'EmUso' });

    const resposta = await devolver(app, dora.id, reserva.id);

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'proibido',
        mensagem:
          'RN13 · Gestor do Recurso: Só o Gestor responsável por este Recurso pode registrar a Devolução dele.',
        violacoes: [
          {
            rn: 'RN13',
            nome: 'Gestor do Recurso',
            mensagem: 'Só o Gestor responsável por este Recurso pode registrar a Devolução dele.',
          },
        ],
      },
    });
    expect((await abrir(app, carlos.id, reserva.id)).json().status).toBe('EmUso');
  });

  it.each(['Aluno', 'Docente'] as const)(
    '%s tentando registrar Devolução → 403',
    async (perfil) => {
      const app = await umaAppAs('12:10');
      const usuario = await umUsuario(banco, perfil);
      const p123 = await umEquipamento(banco);
      const reserva = await umaReserva(banco, {
        usuarioId: usuario.id,
        recursoId: p123.id,
        status: 'EmUso',
      });

      const resposta = await devolver(app, usuario.id, reserva.id);

      expect(resposta.statusCode).toBe(403);
      expect(resposta.json().erro).toMatchObject({
        codigo: 'proibido',
        mensagem: 'Só Gestor pode fazer isto.',
      });
    },
  );

  it('Reserva que não existe → 404', async () => {
    const app = await umaAppAs('12:10');
    const carlos = await umUsuario(banco, 'Gestor');

    const resposta = await devolver(app, carlos.id, 999);

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json().erro).toMatchObject({
      codigo: 'nao_encontrado',
      mensagem: 'Reserva 999 não encontrada.',
    });
  });

  it('POST /api/reservas/:id/devolucao sem sessão → 401', async () => {
    const app = await umaAppAs('12:10');
    const reserva = await umaReserva(banco);

    const resposta = await app.inject({
      method: 'POST',
      url: `/api/reservas/${reserva.id}/devolucao`,
      payload: {},
    });

    expect(resposta.statusCode).toBe(401);
  });
});
