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

// O agora da `umaApp` é terça, 10/11/2026, 8h.

const MANUTENCAO = {
  inicio: '2026-11-10T08:00:00-03:00',
  fim: '2026-11-12T18:00:00-03:00',
  motivo: 'Troca do ar-condicionado',
};

const CAUSA = 'Cancelamento pelo sistema: o Recurso ficou indisponível (Troca do ar-condicionado).';

/** A Sala 102 do Carlos, com a Bia de Aluna. */
async function cenario() {
  const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
  const sala = await umEspaco(banco, { gestorId: carlos.id, nome: 'Sala 102' });
  const bia = await umUsuario(banco, 'Aluno', { nome: 'Bia' });
  return { carlos, sala, bia };
}

comBanco('US05 · Cadastrar Indisponibilidade', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('RN04 · Carlos marca a Sala 102 indisponível → 201, e a Reserva Confirmada da Bia recebe Cancelamento pelo sistema sem Penalidade', async () => {
    const app = await umaApp({ banco });
    const { carlos, sala, bia } = await cenario();
    const reserva = await umaReserva(banco, { usuarioId: bia.id, recursoId: sala.id });

    const resposta = await app.inject({
      method: 'POST',
      url: `/api/recursos/${sala.id}/indisponibilidades`,
      cookies: sessaoDe(app, carlos.id),
      payload: MANUTENCAO,
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({
      indisponibilidade: {
        id: expect.any(Number),
        recursoId: sala.id,
        ...MANUTENCAO,
        criadaEm: '2026-11-10T08:00:00-03:00',
      },
      reservasCanceladas: 1,
    });
    const cancelada = await banco.reserva.findUniqueOrThrow({
      where: { id: reserva.id },
      include: { transicoes: true },
    });
    expect(cancelada.status).toBe('Cancelada');
    expect(cancelada.transicoes).toEqual([
      expect.objectContaining({
        de: 'Confirmada',
        para: 'Cancelada',
        em: new Date('2026-11-10T08:00:00-03:00'),
        porId: null,
        observacao: CAUSA,
      }),
    ]);
    expect(await banco.penalidade.count()).toBe(0);
  });

  it('RN04 · Reserva Em uso no período continua Em uso', async () => {
    const app = await umaApp({ banco });
    const { carlos, sala, bia } = await cenario();
    const emUso = await umaReserva(banco, {
      usuarioId: bia.id,
      recursoId: sala.id,
      inicio: '2026-11-10T07:30:00-03:00',
      fim: '2026-11-10T09:00:00-03:00',
      status: 'EmUso',
    });

    const resposta = await app.inject({
      method: 'POST',
      url: `/api/recursos/${sala.id}/indisponibilidades`,
      cookies: sessaoDe(app, carlos.id),
      payload: MANUTENCAO,
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({ reservasCanceladas: 0 });
    expect(await banco.reserva.findUniqueOrThrow({ where: { id: emUso.id } })).toMatchObject({
      status: 'EmUso',
    });
  });

  it('RN04 · tirar de uso: Indisponibilidade sem fim cancela as Reservas Pendentes e Confirmadas futuras', async () => {
    const app = await umaApp({ banco });
    const { carlos, sala, bia } = await cenario();
    await umaReserva(banco, { usuarioId: bia.id, recursoId: sala.id });
    await umaReserva(banco, {
      usuarioId: bia.id,
      recursoId: sala.id,
      inicio: '2027-03-01T10:00:00-03:00',
      fim: '2027-03-01T12:00:00-03:00',
      status: 'Pendente',
    });

    const resposta = await app.inject({
      method: 'POST',
      url: `/api/recursos/${sala.id}/indisponibilidades`,
      cookies: sessaoDe(app, carlos.id),
      payload: { ...MANUTENCAO, fim: null, motivo: 'Fora de uso' },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({
      indisponibilidade: { fim: null, motivo: 'Fora de uso' },
      reservasCanceladas: 2,
    });
    expect(await banco.reserva.count({ where: { status: 'Cancelada' } })).toBe(2);
    const transicoes = await banco.transicao.findMany({ orderBy: { reservaId: 'asc' } });
    expect(transicoes.map(({ de, para, porId }) => ({ de, para, porId }))).toEqual([
      { de: 'Confirmada', para: 'Cancelada', porId: null },
      { de: 'Pendente', para: 'Cancelada', porId: null },
    ]);
  });

  it('RN04 · início no passado → 422 citando a RN04, nada gravado e nenhuma Reserva cancelada', async () => {
    const app = await umaApp({ banco });
    const { carlos, sala, bia } = await cenario();
    await umaReserva(banco, { usuarioId: bia.id, recursoId: sala.id });

    const resposta = await app.inject({
      method: 'POST',
      url: `/api/recursos/${sala.id}/indisponibilidades`,
      cookies: sessaoDe(app, carlos.id),
      payload: { inicio: '2026-11-01T08:00:00-03:00', fim: null, motivo: 'Fora de uso' },
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toMatchObject({
      codigo: 'regra_violada',
      violacoes: [
        {
          rn: 'RN04',
          mensagem:
            'A Indisponibilidade não pode começar no passado: o primeiro horário possível é 08:00.',
        },
      ],
    });
    expect(await banco.indisponibilidade.count()).toBe(0);
    expect(await banco.reserva.count({ where: { status: 'Confirmada' } })).toBe(1);
    expect(await banco.transicao.count()).toBe(0);
  });

  it('RN13 · Dora marcando Indisponibilidade na Sala 102 do Carlos → 403 citando a RN13, e nada muda', async () => {
    const app = await umaApp({ banco });
    const { sala, bia } = await cenario();
    const dora = await umUsuario(banco, 'Gestor', { nome: 'Dora' });
    await umaReserva(banco, { usuarioId: bia.id, recursoId: sala.id });

    const resposta = await app.inject({
      method: 'POST',
      url: `/api/recursos/${sala.id}/indisponibilidades`,
      cookies: sessaoDe(app, dora.id),
      payload: MANUTENCAO,
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json().erro).toMatchObject({
      codigo: 'proibido',
      mensagem:
        'RN13 · Gestor do Recurso: Só o Gestor responsável por este Recurso pode marcá-lo como indisponível.',
    });
    expect(await banco.indisponibilidade.count()).toBe(0);
    expect(await banco.reserva.count({ where: { status: 'Confirmada' } })).toBe(1);
  });

  it('Aluno marcando Indisponibilidade → 403', async () => {
    const app = await umaApp({ banco });
    const { sala, bia } = await cenario();

    const resposta = await app.inject({
      method: 'POST',
      url: `/api/recursos/${sala.id}/indisponibilidades`,
      cookies: sessaoDe(app, bia.id),
      payload: MANUTENCAO,
    });

    expect(resposta.statusCode).toBe(403);
  });

  it.each([
    ['início fora da meia hora', { inicio: '2026-11-10T08:15:00-03:00' }],
    ['fim fora da meia hora', { fim: '2026-11-12T18:10:00-03:00' }],
    ['fim antes do início', { fim: '2026-11-09T18:00:00-03:00' }],
    ['motivo em branco', { motivo: '   ' }],
    ['sem motivo', { motivo: undefined }],
  ])('%s → 400 entrada_invalida', async (_, troca) => {
    const app = await umaApp({ banco });
    const { carlos, sala } = await cenario();

    const resposta = await app.inject({
      method: 'POST',
      url: `/api/recursos/${sala.id}/indisponibilidades`,
      cookies: sessaoDe(app, carlos.id),
      payload: { ...MANUTENCAO, ...troca },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro.codigo).toBe('entrada_invalida');
    expect(await banco.indisponibilidade.count()).toBe(0);
  });

  it('Recurso que não existe → 404', async () => {
    const app = await umaApp({ banco });
    const { carlos } = await cenario();

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/recursos/999/indisponibilidades',
      cookies: sessaoDe(app, carlos.id),
      payload: MANUTENCAO,
    });

    expect(resposta.statusCode).toBe(404);
  });
});
