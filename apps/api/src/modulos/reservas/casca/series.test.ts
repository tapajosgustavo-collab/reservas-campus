import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from '../../../comum/banco';
import { sessaoDe, umaApp } from '../../../teste/app';
import {
  bancoDeTeste,
  comBanco,
  esvaziar,
  umaIndisponibilidade,
  umaReserva,
  umEspaco,
  umUsuario,
} from '../../../teste/banco';

let banco: Banco;

// O agora da `umaApp` é terça, 10/11/2026, 8h. A Série é das terças, das 10h às 12h.
const INICIO = '2026-11-10T10:00:00-03:00';
const FIM = '2026-11-10T12:00:00-03:00';

const SEG_A_SEX_7H_23H = {
  create: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: 7 * 60, fecha: 23 * 60 })),
};

type App = Awaited<ReturnType<typeof umaApp>>;

async function cenario() {
  const lab = await umEspaco(banco, { horarios: SEG_A_SEX_7H_23H });
  const carla = await umUsuario(banco, 'Docente');
  return { lab, carla };
}

function criarSerie(app: App, usuarioId: number, corpo: object) {
  return app.inject({
    method: 'POST',
    url: '/api/series',
    cookies: sessaoDe(app, usuarioId),
    payload: corpo,
  });
}

const tresTercas = (recursoId: number) => ({
  recursoId,
  inicio: INICIO,
  fim: FIM,
  ate: '2026-11-24',
  participantes: 30,
  finalidade: 'Aula de Cálculo',
});

comBanco('US09 · Criar Série', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('Docente cria três terças → 201 com a Série e as Ocorrências, cada uma com a transição', async () => {
    const app = await umaApp({ banco });
    const { lab, carla } = await cenario();

    const resposta = await criarSerie(app, carla.id, tresTercas(lab.id));

    expect(resposta.statusCode).toBe(201);
    const { serie, reservas } = resposta.json();
    expect(serie).toEqual({
      id: expect.any(Number),
      recursoId: lab.id,
      criadaEm: '2026-11-10T08:00:00-03:00',
    });
    expect(reservas).toMatchObject(
      ['10', '17', '24'].map((dia) => ({
        recursoId: lab.id,
        inicio: `2026-11-${dia}T10:00:00-03:00`,
        fim: `2026-11-${dia}T12:00:00-03:00`,
        participantes: 30,
        finalidade: 'Aula de Cálculo',
        status: 'Confirmada',
      })),
    );
    const gravadas = await banco.reserva.findMany({
      where: { serieId: serie.id, usuarioId: carla.id },
      include: { transicoes: true },
    });
    expect(gravadas).toHaveLength(3);
    for (const { transicoes } of gravadas) {
      expect(transicoes).toMatchObject([{ de: null, para: 'Confirmada', porId: carla.id }]);
    }
  });

  it('RN21 · uma data com Conflito → 422 com a data, e nenhuma Ocorrência criada', async () => {
    const app = await umaApp({ banco });
    const { lab, carla } = await cenario();
    await umaReserva(banco, {
      recursoId: lab.id,
      inicio: '2026-11-24T11:00:00-03:00',
      fim: '2026-11-24T13:00:00-03:00',
    });

    const resposta = await criarSerie(app, carla.id, tresTercas(lab.id));

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toMatchObject({
      codigo: 'regra_violada',
      violacoes: [{ rn: 'RN01', data: '2026-11-24', campo: 'intervalo' }],
    });
    expect(await banco.serie.count()).toBe(0);
    expect(await banco.reserva.count({ where: { usuarioId: carla.id } })).toBe(0);
  });

  it('RN21 · data desmarcada nem é validada, mesmo com Indisponibilidade nela', async () => {
    const app = await umaApp({ banco });
    const { lab, carla } = await cenario();
    await umaIndisponibilidade(banco, {
      recursoId: lab.id,
      inicio: '2026-11-17T00:00:00-03:00',
      fim: '2026-11-18T00:00:00-03:00',
      motivo: 'Feriado',
    });

    const resposta = await criarSerie(app, carla.id, {
      ...tresTercas(lab.id),
      datasExcluidas: ['2026-11-17'],
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().reservas.map((r: { inicio: string }) => r.inicio)).toEqual([
      '2026-11-10T10:00:00-03:00',
      '2026-11-24T10:00:00-03:00',
    ]);
  });

  it('RN21 · Aluno tenta criar uma Série → 403 citando a RN21', async () => {
    const app = await umaApp({ banco });
    const { lab } = await cenario();
    const ana = await umUsuario(banco, 'Aluno');

    const resposta = await criarSerie(app, ana.id, tresTercas(lab.id));

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json().erro).toMatchObject({
      codigo: 'proibido',
      mensagem: 'RN21 · Série tudo-ou-nada: Só Docentes criam Séries.',
      violacoes: [{ rn: 'RN21' }],
    });
    expect(await banco.serie.count()).toBe(0);
  });

  it('Gestor não cria Série → 403 pelo Perfil da rota', async () => {
    const app = await umaApp({ banco });
    const { lab } = await cenario();
    const gestor = await umUsuario(banco, 'Gestor');

    const resposta = await criarSerie(app, gestor.id, tresTercas(lab.id));

    expect(resposta.statusCode).toBe(403);
  });

  it('RN07 · a Série conta 1 na Cota: com 9 avulsas cria, e depois a 11ª avulsa é recusada', async () => {
    const app = await umaApp({ banco });
    const { lab, carla } = await cenario();
    const outro = await umEspaco(banco, { horarios: SEG_A_SEX_7H_23H });
    for (let hora = 7; hora < 16; hora++) {
      await umaReserva(banco, {
        usuarioId: carla.id,
        recursoId: outro.id,
        inicio: `2026-11-12T${String(hora).padStart(2, '0')}:00:00-03:00`,
        fim: `2026-11-12T${String(hora).padStart(2, '0')}:30:00-03:00`,
      });
    }

    expect((await criarSerie(app, carla.id, tresTercas(lab.id))).statusCode).toBe(201);

    const avulsa = await app.inject({
      method: 'POST',
      url: '/api/reservas',
      cookies: sessaoDe(app, carla.id),
      payload: {
        recursoId: outro.id,
        inicio: '2026-11-13T10:00:00-03:00',
        fim: '2026-11-13T11:00:00-03:00',
        participantes: 10,
      },
    });
    expect(avulsa.statusCode).toBe(422);
    expect(avulsa.json().erro.violacoes).toMatchObject([
      { rn: 'RN07', mensagem: 'Você já tem 10 Reservas ativas, e a Cota de Docente é 10.' },
    ]);
  });

  it('data final em formato errado → 400', async () => {
    const app = await umaApp({ banco });
    const { lab, carla } = await cenario();

    const resposta = await criarSerie(app, carla.id, { ...tresTercas(lab.id), ate: '24/11/2026' });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro.codigo).toBe('entrada_invalida');
  });
});
