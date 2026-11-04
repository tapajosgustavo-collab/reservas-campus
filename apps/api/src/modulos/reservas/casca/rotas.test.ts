import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from '../../../comum/banco';
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

// O agora da `umaApp` é terça, 10/11/2026, 8h.
const INICIO = '2026-11-10T10:00:00-03:00';
const FIM = '2026-11-10T12:00:00-03:00';

const SEG_A_SEX_7H_23H = {
  create: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: 7 * 60, fecha: 23 * 60 })),
};

async function cenario() {
  const lab = await umEspaco(banco, { horarios: SEG_A_SEX_7H_23H });
  const ana = await umUsuario(banco, 'Aluno');
  return { lab, ana };
}

type App = Awaited<ReturnType<typeof umaApp>>;

function reservar(app: App, usuarioId: number, corpo: object) {
  return app.inject({
    method: 'POST',
    url: '/api/reservas',
    cookies: sessaoDe(app, usuarioId),
    payload: corpo,
  });
}

comBanco('US08 · Reservar', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('Aluno reserva um Recurso livre → 201 Confirmada, com a primeira transição', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      inicio: INICIO,
      fim: FIM,
      participantes: 20,
      finalidade: 'Monitoria',
    });

    expect(resposta.statusCode).toBe(201);
    const reserva = resposta.json();
    expect(reserva).toEqual({
      id: expect.any(Number),
      recursoId: lab.id,
      inicio: INICIO,
      fim: FIM,
      participantes: 20,
      finalidade: 'Monitoria',
      status: 'Confirmada',
      criadaEm: '2026-11-10T08:00:00-03:00',
    });
    const transicoes = await banco.transicao.findMany({ where: { reservaId: reserva.id } });
    expect(transicoes).toMatchObject([
      { de: null, para: 'Confirmada', porId: ana.id, em: new Date('2026-11-10T11:00:00Z') },
    ]);
  });

  it('a Reserva criada aparece na agenda como do dono', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();
    const criada = await reservar(app, ana.id, { recursoId: lab.id, inicio: INICIO, fim: FIM });

    const agenda = await app.inject({
      method: 'GET',
      url: `/api/recursos/${lab.id}/agenda`,
      cookies: sessaoDe(app, ana.id),
    });

    expect(agenda.json().ocupacoes).toEqual([
      { inicio: INICIO, fim: FIM, minha: true, reservaId: criada.json().id, status: 'Confirmada' },
    ]);
  });

  it('Docente também reserva', async () => {
    const app = await umaApp({ banco });
    const { lab } = await cenario();
    const docente = await umUsuario(banco, 'Docente');

    const resposta = await reservar(app, docente.id, {
      recursoId: lab.id,
      inicio: INICIO,
      fim: FIM,
    });

    expect(resposta.statusCode).toBe(201);
  });

  it('RN01 · Intervalo ocupado → 422 com o horário e sem dizer quem', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();
    await umaReserva(banco, { recursoId: lab.id, inicio: INICIO, fim: FIM });

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      inicio: '2026-11-10T11:00:00-03:00',
      fim: '2026-11-10T13:00:00-03:00',
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toMatchObject({
      codigo: 'regra_violada',
      violacoes: [
        {
          rn: 'RN01',
          nome: 'Sem Conflito',
          mensagem: 'Este Recurso já está ocupado das 10:00 às 12:00.',
        },
      ],
    });
  });

  it('RN01 · só se encostar não é Conflito', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();
    await umaReserva(banco, { recursoId: lab.id, inicio: INICIO, fim: FIM });

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      inicio: FIM,
      fim: '2026-11-10T14:00:00-03:00',
    });

    expect(resposta.statusCode).toBe(201);
  });

  it('RN01, RN02 e RN03 · todas as violações na mesma resposta, nada gravado', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();
    await umaReserva(banco, {
      recursoId: lab.id,
      inicio: '2026-11-10T22:00:00-03:00',
      fim: '2026-11-10T23:00:00-03:00',
    });

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      inicio: '2026-11-10T22:15:00-03:00',
      fim: '2026-11-10T23:30:00-03:00',
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.mensagem).toBe(
      'Não foi possível concluir: 3 regras impedem a operação.',
    );
    expect(resposta.json().erro.violacoes.map(({ rn }: { rn: string }) => rn)).toEqual([
      'RN01',
      'RN02',
      'RN03',
    ]);
    expect(await banco.reserva.count()).toBe(1);
  });

  it('o deslocamento da entrada não muda o dia: 01h UTC é 22h de São Paulo', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      inicio: '2026-11-11T01:00:00Z',
      fim: '2026-11-11T02:00:00Z',
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().inicio).toBe('2026-11-10T22:00:00-03:00');
  });

  it('Gestor tentando reservar → 403', async () => {
    const app = await umaApp({ banco });
    const { lab } = await cenario();
    const gestor = await umUsuario(banco, 'Gestor');

    const resposta = await reservar(app, gestor.id, {
      recursoId: lab.id,
      inicio: INICIO,
      fim: FIM,
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json().erro.codigo).toBe('proibido');
    expect(await banco.reserva.count()).toBe(0);
  });

  it('sem sessão → 401', async () => {
    const app = await umaApp({ banco });

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/reservas',
      payload: { recursoId: 1, inicio: INICIO, fim: FIM },
    });

    expect(resposta.statusCode).toBe(401);
  });

  it('Recurso que não existe → 404', async () => {
    const app = await umaApp({ banco });
    const { ana } = await cenario();

    const resposta = await reservar(app, ana.id, { recursoId: 999, inicio: INICIO, fim: FIM });

    expect(resposta.statusCode).toBe(404);
  });

  it('Finalidade com mais de 200 caracteres → 400', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      inicio: INICIO,
      fim: FIM,
      finalidade: 'x'.repeat(201),
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro.codigo).toBe('entrada_invalida');
  });

  it('instante sem deslocamento → 400', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      inicio: '2026-11-10T10:00:00',
      fim: FIM,
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('Participantes em Equipamento → 400', async () => {
    const app = await umaApp({ banco });
    const { ana } = await cenario();
    const projetor = await umEquipamento(banco, { horarios: SEG_A_SEX_7H_23H });

    const resposta = await reservar(app, ana.id, {
      recursoId: projetor.id,
      inicio: INICIO,
      fim: FIM,
      participantes: 3,
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro.mensagem).toBe('Equipamento não tem Participantes.');
  });

  it('RNF11 · RN01: 10 requisições simultâneas → 1 Reserva, as outras citam a RN01', async () => {
    const app = await umaApp({ banco });
    const lab = await umEspaco(banco, { horarios: SEG_A_SEX_7H_23H });
    const alunos = await Promise.all(Array.from({ length: 10 }, () => umUsuario(banco, 'Aluno')));

    const respostas = await Promise.all(
      alunos.map(({ id }) => reservar(app, id, { recursoId: lab.id, inicio: INICIO, fim: FIM })),
    );

    const status = respostas.map(({ statusCode }) => statusCode).sort();
    expect(status).toEqual([201, ...Array<number>(9).fill(422)]);
    const recusadas = respostas.filter(({ statusCode }) => statusCode === 422);
    for (const recusada of recusadas) {
      expect(recusada.json().erro.violacoes).toMatchObject([{ rn: 'RN01' }]);
    }
    expect(await banco.reserva.count()).toBe(1);
  });
});
