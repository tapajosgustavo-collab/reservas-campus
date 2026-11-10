import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from '../../../comum/banco';
import { sessaoDe, umaApp } from '../../../teste/app';
import {
  bancoDeTeste,
  comBanco,
  esvaziar,
  umaIndisponibilidade,
  umaReserva,
  umEquipamento,
  umEspaco,
  umUsuario,
} from '../../../teste/banco';

let banco: Banco;

// O agora da `umaApp` é terça, 10/11/2026, 8h.
const INICIO = '2026-11-10T10:00:00-03:00';
const FIM = '2026-11-10T12:00:00-03:00';
// Quarta, 26h depois do agora: passa das 24h do Recurso restrito (RN05).
const AMANHA_INICIO = '2026-11-11T10:00:00-03:00';
const AMANHA_FIM = '2026-11-11T12:00:00-03:00';

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
    const criada = await reservar(app, ana.id, {
      recursoId: lab.id,
      inicio: INICIO,
      fim: FIM,
      participantes: 20,
    });

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
      participantes: 20,
      inicio: INICIO,
      fim: FIM,
    });

    expect(resposta.statusCode).toBe(201);
  });

  it('RN01 · Intervalo ocupado → 422 com o horário e sem dizer quem', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();
    await umaReserva(banco, { recursoId: lab.id, inicio: INICIO, fim: FIM, participantes: 20 });

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      participantes: 20,
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
    await umaReserva(banco, { recursoId: lab.id, inicio: INICIO, fim: FIM, participantes: 20 });

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      participantes: 20,
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
      participantes: 20,
      inicio: '2026-11-10T22:00:00-03:00',
      fim: '2026-11-10T23:00:00-03:00',
    });

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      participantes: 20,
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

  it('RN05 · início a menos de 1h → 422 com o limite', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      participantes: 20,
      inicio: '2026-11-10T08:30:00-03:00',
      fim: '2026-11-10T09:00:00-03:00',
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toEqual([
      {
        rn: 'RN05',
        nome: 'Antecedência',
        mensagem: 'O início precisa ser pelo menos 1h depois de agora.',
        campo: 'intervalo',
      },
    ]);
  });

  it('RN04 · Intervalo dentro de uma Indisponibilidade → 422 citando a RN04 com o motivo, nada gravado', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();
    await umaIndisponibilidade(banco, {
      recursoId: lab.id,
      inicio: '2026-11-10T09:00:00-03:00',
      fim: '2026-11-12T18:00:00-03:00',
      motivo: 'Troca do ar-condicionado',
    });

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      participantes: 20,
      inicio: INICIO,
      fim: FIM,
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toEqual([
      {
        rn: 'RN04',
        nome: 'Indisponibilidade',
        mensagem: 'Este Recurso está indisponível neste Intervalo: Troca do ar-condicionado.',
        campo: 'intervalo',
      },
    ]);
    expect(await banco.reserva.count()).toBe(0);
  });

  it('RN04 · Indisponibilidade sem fim cobre qualquer data futura: Docente pede 29/12 → 422', async () => {
    const app = await umaApp({ banco });
    const { lab } = await cenario();
    const bruno = await umUsuario(banco, 'Docente');
    await umaIndisponibilidade(banco, {
      recursoId: lab.id,
      inicio: '2026-11-10T09:00:00-03:00',
      fim: null,
      motivo: 'Fora de uso',
    });

    const resposta = await reservar(app, bruno.id, {
      recursoId: lab.id,
      participantes: 20,
      inicio: '2026-12-29T10:00:00-03:00',
      fim: '2026-12-29T12:00:00-03:00',
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toMatchObject([
      { rn: 'RN04', mensagem: 'Este Recurso está indisponível neste Intervalo: Fora de uso.' },
    ]);
  });

  it('RN04 · Indisponibilidade que só encosta, ou de outro Recurso, não impede → 201', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();
    const outro = await umEspaco(banco);
    await umaIndisponibilidade(banco, {
      recursoId: lab.id,
      inicio: '2026-11-10T08:00:00-03:00',
      fim: INICIO,
    });
    await umaIndisponibilidade(banco, { recursoId: outro.id, fim: null });

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      participantes: 20,
      inicio: INICIO,
      fim: FIM,
    });

    expect(resposta.statusCode).toBe(201);
  });

  it('RN01, RN04, RN05 e RN08 · a RN04 vem junto das outras violações numa resposta só', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();
    await umaReserva(banco, {
      recursoId: lab.id,
      inicio: '2026-11-10T08:00:00-03:00',
      fim: '2026-11-10T09:00:00-03:00',
    });
    await umaIndisponibilidade(banco, {
      recursoId: lab.id,
      inicio: '2026-11-10T08:00:00-03:00',
      fim: null,
    });

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      participantes: 41,
      inicio: '2026-11-10T08:30:00-03:00',
      fim: '2026-11-10T10:00:00-03:00',
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes.map(({ rn }: { rn: string }) => rn)).toEqual([
      'RN01',
      'RN04',
      'RN05',
      'RN08',
    ]);
    expect(await banco.reserva.count()).toBe(1);
  });

  it('RN06 · Aluno por 2h30 → 422; Docente no mesmo Intervalo → 201', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();
    const docente = await umUsuario(banco, 'Docente');
    const corpo = {
      recursoId: lab.id,
      participantes: 20,
      inicio: INICIO,
      fim: '2026-11-10T12:30:00-03:00',
    };

    const doAluno = await reservar(app, ana.id, corpo);
    const doDocente = await reservar(app, docente.id, corpo);

    expect(doAluno.statusCode).toBe(422);
    expect(doAluno.json().erro.violacoes).toMatchObject([{ rn: 'RN06' }]);
    expect(doDocente.statusCode).toBe(201);
  });

  it('RN06 · Equipamento tem o limite do tipo: Aluno por 4h, sem Participantes → 201', async () => {
    const app = await umaApp({ banco });
    const { ana } = await cenario();
    const projetor = await umEquipamento(banco, { horarios: SEG_A_SEX_7H_23H });

    const resposta = await reservar(app, ana.id, {
      recursoId: projetor.id,
      inicio: INICIO,
      fim: '2026-11-10T14:00:00-03:00',
    });

    expect(resposta.statusCode).toBe(201);
  });

  it('RN08 · acima da Capacidade do Espaço → 422 com a Capacidade', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      inicio: INICIO,
      fim: FIM,
      participantes: 41,
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toEqual([
      {
        rn: 'RN08',
        nome: 'Capacidade',
        mensagem: 'Este Espaço comporta até 40 pessoas.',
        campo: 'participantes',
      },
    ]);
  });

  it('RN08 · Espaço sem Participantes → 422', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();

    const resposta = await reservar(app, ana.id, { recursoId: lab.id, inicio: INICIO, fim: FIM });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toMatchObject([{ rn: 'RN08' }]);
  });

  it('RN06 e RN08 · as duas na mesma resposta, nada gravado', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      inicio: INICIO,
      fim: '2026-11-10T12:30:00-03:00',
      participantes: 41,
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes.map(({ rn }: { rn: string }) => rn)).toEqual([
      'RN06',
      'RN08',
    ]);
    expect(await banco.reserva.count()).toBe(0);
  });

  it('o deslocamento da entrada não muda o dia: 01h UTC é 22h de São Paulo', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      participantes: 20,
      inicio: '2026-11-11T01:00:00Z',
      fim: '2026-11-11T02:00:00Z',
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().inicio).toBe('2026-11-10T22:00:00-03:00');
  });

  it('RN10 · Aluno reserva um Recurso restrito → 201 Pendente, com a primeira transição', async () => {
    const app = await umaApp({ banco });
    const { ana } = await cenario();
    const restrito = await umEspaco(banco, { restrito: true, horarios: SEG_A_SEX_7H_23H });

    const resposta = await reservar(app, ana.id, {
      recursoId: restrito.id,
      inicio: AMANHA_INICIO,
      fim: AMANHA_FIM,
      participantes: 20,
    });

    expect(resposta.statusCode).toBe(201);
    const pedido = resposta.json();
    expect(pedido).toMatchObject({ status: 'Pendente', inicio: AMANHA_INICIO, fim: AMANHA_FIM });
    const transicoes = await banco.transicao.findMany({ where: { reservaId: pedido.id } });
    expect(transicoes).toMatchObject([{ de: null, para: 'Pendente', porId: ana.id }]);
  });

  it('RN05 · Recurso restrito a menos de 24h → 422 com a Antecedência em Recurso restrito, nada gravado', async () => {
    const app = await umaApp({ banco });
    const { ana } = await cenario();
    const restrito = await umEspaco(banco, { restrito: true, horarios: SEG_A_SEX_7H_23H });

    // Hoje às 10h: passa da 1h de um Recurso comum, mas não das 24h do restrito.
    const resposta = await reservar(app, ana.id, {
      recursoId: restrito.id,
      inicio: INICIO,
      fim: FIM,
      participantes: 20,
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toEqual([
      {
        rn: 'RN05',
        nome: 'Antecedência',
        mensagem: 'Em Recurso restrito, o início precisa ser pelo menos 24h depois de agora.',
        campo: 'intervalo',
      },
    ]);
    expect(await banco.reserva.count()).toBe(0);
  });

  it('RN10 · o Pedido Pendente já ocupa o Intervalo: Bruno no mesmo Intervalo → 422 RN01', async () => {
    const app = await umaApp({ banco });
    const { ana } = await cenario();
    const bruno = await umUsuario(banco, 'Aluno');
    const restrito = await umEspaco(banco, { restrito: true, horarios: SEG_A_SEX_7H_23H });
    const corpo = {
      recursoId: restrito.id,
      inicio: AMANHA_INICIO,
      fim: AMANHA_FIM,
      participantes: 5,
    };
    expect((await reservar(app, ana.id, corpo)).statusCode).toBe(201);

    const resposta = await reservar(app, bruno.id, corpo);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toMatchObject([{ rn: 'RN01' }]);
    expect(await banco.reserva.count()).toBe(1);
  });

  it('RN10 · o Pedido conta na Cota: Aluno com 2 Confirmadas e 1 Pendente → 422 RN07', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();
    for (const dia of ['12', '13']) {
      await umaReserva(banco, {
        usuarioId: ana.id,
        inicio: `2026-11-${dia}T10:00:00-03:00`,
        fim: `2026-11-${dia}T12:00:00-03:00`,
      });
    }
    await umaReserva(banco, {
      usuarioId: ana.id,
      inicio: AMANHA_INICIO,
      fim: AMANHA_FIM,
      status: 'Pendente',
    });

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      inicio: INICIO,
      fim: FIM,
      participantes: 20,
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toMatchObject([
      { rn: 'RN07', mensagem: 'Você já tem 3 Reservas ativas, e a Cota de Aluno é 3.' },
    ]);
  });

  it('Gestor tentando reservar → 403', async () => {
    const app = await umaApp({ banco });
    const { lab } = await cenario();
    const gestor = await umUsuario(banco, 'Gestor');

    const resposta = await reservar(app, gestor.id, {
      recursoId: lab.id,
      participantes: 20,
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
      participantes: 20,
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
      participantes: 20,
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
      alunos.map(({ id }) =>
        reservar(app, id, { recursoId: lab.id, inicio: INICIO, fim: FIM, participantes: 20 }),
      ),
    );

    const status = respostas.map(({ statusCode }) => statusCode).sort();
    expect(status).toEqual([201, ...Array<number>(9).fill(422)]);
    const recusadas = respostas.filter(({ statusCode }) => statusCode === 422);
    for (const recusada of recusadas) {
      expect(recusada.json().erro.violacoes).toMatchObject([{ rn: 'RN01' }]);
    }
    expect(await banco.reserva.count()).toBe(1);
  });

  it('RN07 · Aluno com 3 Reservas ativas → 422 citando a Cota, nada gravado', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();
    for (const status of ['Pendente', 'Confirmada', 'EmUso'] as const) {
      await umaReserva(banco, { usuarioId: ana.id, status });
    }

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      inicio: INICIO,
      fim: FIM,
      participantes: 20,
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro.violacoes).toEqual([
      {
        rn: 'RN07',
        nome: 'Cota',
        mensagem: 'Você já tem 3 Reservas ativas, e a Cota de Aluno é 3.',
      },
    ]);
    expect(await banco.reserva.count({ where: { recursoId: lab.id } })).toBe(0);
  });

  it('RN07 · Reserva que deixou de estar ativa não conta: 2 ativas, 1 Cancelada e 1 Concluída → 201', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();
    for (const status of ['Confirmada', 'Confirmada', 'Cancelada', 'Concluida'] as const) {
      await umaReserva(banco, { usuarioId: ana.id, status });
    }

    const resposta = await reservar(app, ana.id, {
      recursoId: lab.id,
      inicio: INICIO,
      fim: FIM,
      participantes: 20,
    });

    expect(resposta.statusCode).toBe(201);
  });

  it('RN07 · as Ocorrências ativas de uma Série contam como 1: Docente com uma Série de 12 e 8 avulsas → 201', async () => {
    const app = await umaApp({ banco });
    const lab = await umEspaco(banco, { horarios: SEG_A_SEX_7H_23H });
    const docente = await umUsuario(banco, 'Docente');
    const sala = await umEspaco(banco);
    const serie = await banco.serie.create({
      data: { usuarioId: docente.id, recursoId: sala.id, criadaEm: new Date(INICIO) },
    });
    const SEMANA = 7 * 24 * 60 * 60_000;
    const semanas = (instante: string, n: number) =>
      new Date(Date.parse(instante) + n * SEMANA).toISOString();
    for (let n = 0; n < 12; n++) {
      await umaReserva(banco, {
        usuarioId: docente.id,
        recursoId: sala.id,
        serieId: serie.id,
        inicio: semanas('2026-11-10T14:00:00-03:00', n),
        fim: semanas('2026-11-10T16:00:00-03:00', n),
      });
    }
    for (let i = 0; i < 8; i++) await umaReserva(banco, { usuarioId: docente.id });

    const resposta = await reservar(app, docente.id, {
      recursoId: lab.id,
      inicio: INICIO,
      fim: FIM,
      participantes: 20,
    });

    expect(resposta.statusCode).toBe(201);
    const outra = await reservar(app, docente.id, {
      recursoId: lab.id,
      inicio: '2026-11-10T13:00:00-03:00',
      fim: '2026-11-10T14:00:00-03:00',
      participantes: 20,
    });
    expect(outra.statusCode).toBe(422);
    expect(outra.json().erro.violacoes).toMatchObject([{ rn: 'RN07' }]);
  });

  it('RNF11 · RN07: duas requisições simultâneas com uma vaga na Cota → 1 Reserva, a outra cita a RN07', async () => {
    const app = await umaApp({ banco });
    const { lab, ana } = await cenario();
    const sala = await umEspaco(banco, { horarios: SEG_A_SEX_7H_23H });
    await umaReserva(banco, { usuarioId: ana.id });
    await umaReserva(banco, { usuarioId: ana.id });

    const respostas = await Promise.all(
      [lab, sala].map(({ id }) =>
        reservar(app, ana.id, { recursoId: id, inicio: INICIO, fim: FIM, participantes: 20 }),
      ),
    );

    const status = respostas.map(({ statusCode }) => statusCode).sort();
    expect(status).toEqual([201, 422]);
    const recusada = respostas.find(({ statusCode }) => statusCode === 422);
    expect(recusada?.json().erro.violacoes).toMatchObject([{ rn: 'RN07' }]);
    expect(await banco.reserva.count({ where: { usuarioId: ana.id } })).toBe(3);
  });

  it('RNF11 · RN04: Indisponibilidade e Reserva simultâneas no mesmo período → a Reserva é recusada pela RN04 ou cancelada pelo sistema, nunca fica Confirmada', async () => {
    const app = await umaApp({ banco });
    const carlos = await umUsuario(banco, 'Gestor');
    const lab = await umEspaco(banco, { gestorId: carlos.id, horarios: SEG_A_SEX_7H_23H });
    const ana = await umUsuario(banco, 'Aluno');

    const [indisponibilidade, reserva] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/recursos/${lab.id}/indisponibilidades`,
        cookies: sessaoDe(app, carlos.id),
        payload: { inicio: INICIO, fim: FIM, motivo: 'Troca do ar-condicionado' },
      }),
      reservar(app, ana.id, { recursoId: lab.id, inicio: INICIO, fim: FIM, participantes: 20 }),
    ]);

    expect(indisponibilidade.statusCode).toBe(201);
    // Sob o advisory lock, uma das duas vem antes; os dois desfechos valem, Confirmada nunca.
    const desfecho =
      reserva.statusCode === 201
        ? 'criada e cancelada pelo sistema'
        : reserva
            .json()
            .erro.violacoes.map(({ rn }: { rn: string }) => rn)
            .join();
    const reservas = await banco.reserva.findMany({ select: { status: true } });
    expect([
      ['RN04', []],
      ['criada e cancelada pelo sistema', ['Cancelada']],
    ]).toContainEqual([desfecho, reservas.map(({ status }) => status)]);
  });
});
