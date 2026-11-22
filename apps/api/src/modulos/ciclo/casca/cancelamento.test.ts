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

  it('RN16 · a dona cancela a Reserva Confirmada 2h antes do início em ponto → 200 { reserva, penalidade: null }, com a transição no histórico e liberando o Recurso', async () => {
    const app = await umaAppAs('08:00');
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
        em: '2026-11-10T08:00:00-03:00',
        por: { id: ana.id, nome: 'Ana' },
        observacao: null,
      },
    ]);

    // O Intervalo inteiro ficou livre para outra Reserva (RN01).
    const nova = await app.inject({
      method: 'POST',
      url: '/api/reservas',
      cookies: sessaoDe(app, bruno.id),
      payload: {
        recursoId: lab.id,
        inicio: '2026-11-10T10:00:00-03:00',
        fim: '2026-11-10T12:00:00-03:00',
        participantes: 20,
      },
    });
    expect(nova.statusCode).toBe(201);
    expect(await banco.penalidade.count()).toBe(0);
  });

  it('RN16 · a dona cancela a Confirmada a menos de 2h do início → 200 com a Penalidade, gravada no histórico dela e notificada', async () => {
    const app = await umaAppAs('08:30');
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const reserva = await umaReserva(banco, { usuarioId: ana.id });

    const resposta = await cancelar(app, ana.id, reserva.id);

    expect(resposta.statusCode).toBe(200);
    const { penalidade } = resposta.json();
    expect(resposta.json()).toMatchObject({ reserva: { id: reserva.id, status: 'Cancelada' } });
    expect(penalidade).toEqual({
      id: expect.any(Number),
      motivo: 'CancelamentoTardio',
      em: '2026-11-10T08:30:00-03:00',
    });
    expect(await banco.penalidade.findMany()).toMatchObject([
      { id: penalidade.id, usuarioId: ana.id, reservaId: reserva.id, motivo: 'CancelamentoTardio' },
    ]);
    expect(await banco.notificacao.findMany()).toMatchObject([
      {
        destinatarioId: ana.id,
        tipo: 'Penalidade',
        reservaId: reserva.id,
        mensagem: expect.stringContaining('Cancelamento tardio'),
      },
    ]);
  });

  it('RN19_o Cancelamento tardio que é a 3ª Penalidade em 30 dias suspende a dona e avisa o início da Suspensão', async () => {
    const app = await umaAppAs('08:30');
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    // Duas faltas da semana passada: o sincronizar desta requisição as transforma em Penalidades.
    for (const dia of ['02', '03']) {
      await umaReserva(banco, {
        usuarioId: ana.id,
        inicio: `2026-11-${dia}T10:00:00-03:00`,
        fim: `2026-11-${dia}T12:00:00-03:00`,
      });
    }
    const reserva = await umaReserva(banco, { usuarioId: ana.id });

    const resposta = await cancelar(app, ana.id, reserva.id);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().penalidade).toMatchObject({ motivo: 'CancelamentoTardio' });
    const suspensao = await banco.suspensao.findFirstOrThrow({ include: { penalidades: true } });
    expect(suspensao).toMatchObject({
      usuarioId: ana.id,
      inicio: as('08:30'),
      fim: new Date('2026-11-17T08:30:00-03:00'),
    });
    expect(suspensao.penalidades).toHaveLength(3);
    const notificacoes = await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessaoDe(app, ana.id),
    });
    expect(notificacoes.json().itens.map((n: { tipo: string }) => n.tipo)).toEqual([
      'InicioSuspensao',
      'Penalidade',
      'Penalidade',
      'Penalidade',
    ]);
    expect(notificacoes.json().itens[0].mensagem).toBe(
      'Você está suspenso até 17/11/2026 às 08:30 por acumular 3 Penalidades em 30 dias e não pode criar Reservas. As Reservas que você já tem continuam valendo.',
    );
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

function cancelarSerie(app: App, usuarioId: number, serieId: number, payload: object) {
  return app.inject({
    method: 'POST',
    url: `/api/series/${serieId}/cancelamento`,
    cookies: sessaoDe(app, usuarioId),
    payload,
  });
}

/** As terças da Série do Eduardo, das 10h às 12h: 10/11, 17/11 e 24/11. */
const TERCAS = ['10', '17', '24'].map((dia) => ({
  inicio: `2026-11-${dia}T10:00:00-03:00`,
  fim: `2026-11-${dia}T12:00:00-03:00`,
}));

/** A Sala 101 e a Série do Eduardo nela, com as três Ocorrências Confirmadas (inseridas fora de ordem). */
async function umaSerie(status: 'Confirmada' | 'Pendente' = 'Confirmada') {
  const eduardo = await umUsuario(banco, 'Docente', { nome: 'Eduardo' });
  const sala = await umEspaco(banco, {
    nome: 'Sala 101',
    horarios: {
      create: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: 7 * 60, fecha: 23 * 60 })),
    },
  });
  const serie = await banco.serie.create({
    data: {
      usuarioId: eduardo.id,
      recursoId: sala.id,
      criadaEm: new Date('2026-11-01T08:00:00-03:00'),
    },
  });
  const porIndice = new Map<number, Awaited<ReturnType<typeof umaReserva>>>();
  for (const i of [2, 0, 1] as const) {
    porIndice.set(
      i,
      await umaReserva(banco, {
        usuarioId: eduardo.id,
        recursoId: sala.id,
        serieId: serie.id,
        ...TERCAS[i]!,
        participantes: 20,
        finalidade: 'Aula de Cálculo',
        status,
      }),
    );
  }
  const ocorrencias = [porIndice.get(0)!, porIndice.get(1)!, porIndice.get(2)!];
  return { eduardo, sala, serie, ocorrencias };
}

comBanco('US09 · US13 · RN16 · RN21 · Cancelar Série a partir de uma data', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('RN16 · RN21 · o Docente cancela a Série a partir da 2ª data → 200 { canceladas, penalidades: [] }, a 1ª continua Confirmada e as datas canceladas ficam livres', async () => {
    const app = await umaAppAs('08:00');
    const { eduardo, sala, serie, ocorrencias } = await umaSerie();
    const ana = await umUsuario(banco, 'Aluno');

    const resposta = await cancelarSerie(app, eduardo.id, serie.id, { aPartirDe: '2026-11-17' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      canceladas: [1, 2].map((i) => ({
        id: ocorrencias[i]!.id,
        recursoId: sala.id,
        ...TERCAS[i],
        participantes: 20,
        finalidade: 'Aula de Cálculo',
        status: 'Cancelada',
        criadaEm: '2026-11-01T08:00:00-03:00',
      })),
      penalidades: [],
    });
    expect((await abrir(app, eduardo.id, ocorrencias[0]!.id)).json().status).toBe('Confirmada');
    for (const i of [1, 2] as const) {
      expect((await abrir(app, eduardo.id, ocorrencias[i]!.id)).json().historico).toEqual([
        {
          de: 'Confirmada',
          para: 'Cancelada',
          em: '2026-11-10T08:00:00-03:00',
          por: { id: eduardo.id, nome: 'Eduardo' },
          observacao: null,
        },
      ]);
    }
    const nova = await app.inject({
      method: 'POST',
      url: '/api/reservas',
      cookies: sessaoDe(app, ana.id),
      payload: {
        recursoId: sala.id,
        ...TERCAS[1],
        participantes: 15,
      },
    });
    expect(nova.statusCode).toBe(201);
    expect(await banco.penalidade.count()).toBe(0);
  });

  it('RN16 · RN19 · RN21 · cancelar a Série a menos de 2h da 1ª Ocorrência gera Penalidade nela (e Suspensão na 3ª em 30 dias), sem Penalidade nas seguintes', async () => {
    const app = await umaAppAs('08:30');
    const { eduardo, serie, ocorrencias } = await umaSerie();
    for (const dia of ['02', '03']) {
      await umaReserva(banco, {
        usuarioId: eduardo.id,
        inicio: `2026-11-${dia}T10:00:00-03:00`,
        fim: `2026-11-${dia}T12:00:00-03:00`,
      });
    }

    const resposta = await cancelarSerie(app, eduardo.id, serie.id, { aPartirDe: '2026-11-10' });

    expect(resposta.statusCode).toBe(200);
    const { canceladas, penalidades } = resposta.json();
    expect(
      canceladas.map(({ id, status }: { id: number; status: string }) => [id, status]),
    ).toEqual(ocorrencias.map(({ id }) => [id, 'Cancelada']));
    expect(penalidades).toEqual([
      {
        id: expect.any(Number),
        motivo: 'CancelamentoTardio',
        em: '2026-11-10T08:30:00-03:00',
      },
    ]);
    expect(
      await banco.penalidade.findMany({ where: { motivo: 'CancelamentoTardio' } }),
    ).toMatchObject([{ reservaId: ocorrencias[0]!.id, usuarioId: eduardo.id }]);
    const suspensao = await banco.suspensao.findFirstOrThrow({ include: { penalidades: true } });
    expect(suspensao.usuarioId).toBe(eduardo.id);
    expect(suspensao.penalidades).toHaveLength(3);
  });

  it('RN07 · RN21 · cancelar parcialmente a Série mantém 1 vaga ocupada na Cota; cancelar todas as Ocorrências ativas restantes devolve a vaga', async () => {
    const app = await umaAppAs('08:00');
    const { eduardo, sala, serie } = await umaSerie();
    for (let hora = 7; hora < 16; hora++) {
      await umaReserva(banco, {
        usuarioId: eduardo.id,
        inicio: `2026-11-12T${String(hora).padStart(2, '0')}:00:00-03:00`,
        fim: `2026-11-12T${String(hora).padStart(2, '0')}:30:00-03:00`,
      });
    }
    const tentarDecimaPrimeira = () =>
      app.inject({
        method: 'POST',
        url: '/api/reservas',
        cookies: sessaoDe(app, eduardo.id),
        payload: {
          recursoId: sala.id,
          inicio: '2026-11-13T10:00:00-03:00',
          fim: '2026-11-13T11:00:00-03:00',
          participantes: 10,
        },
      });

    // Cancela a partir de 17/11: a Ocorrência de 10/11 ainda está ativa → a Série continua contando 1 na Cota.
    expect(
      (await cancelarSerie(app, eduardo.id, serie.id, { aPartirDe: '2026-11-17' })).statusCode,
    ).toBe(200);
    expect((await tentarDecimaPrimeira()).statusCode).toBe(422);

    // Cancela a partir de 10/11: nenhuma Ocorrência ativa sobra → a vaga na Cota é devolvida.
    expect(
      (await cancelarSerie(app, eduardo.id, serie.id, { aPartirDe: '2026-11-10' })).statusCode,
    ).toBe(200);
    expect((await tentarDecimaPrimeira()).statusCode).toBe(201);
  });

  it('RN16 · nenhuma Ocorrência cancelável a partir da data → 422 citando a regra', async () => {
    const app = await umaAppAs('08:00');
    const { eduardo, serie } = await umaSerie();

    const resposta = await cancelarSerie(app, eduardo.id, serie.id, { aPartirDe: '2026-12-01' });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'regra_violada',
        mensagem: 'Não foi possível concluir: 1 regra impede a operação.',
        violacoes: [
          {
            rn: 'RN16',
            nome: 'Cancelamento',
            mensagem: 'Não há Ocorrências na Série a partir de 01/12/2026.',
            campo: 'aPartirDe',
          },
        ],
      },
    });
  });

  it('RN16 · outra pessoa tentando cancelar a Série → 403 citando a RN16, e as Ocorrências continuam Confirmadas', async () => {
    const app = await umaAppAs('08:00');
    const { eduardo, serie, ocorrencias } = await umaSerie();
    const outro = await umUsuario(banco, 'Docente');

    const resposta = await cancelarSerie(app, outro.id, serie.id, { aPartirDe: '2026-11-10' });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'proibido',
        mensagem: 'RN16 · Cancelamento: Só quem criou a Série pode cancelá-la.',
        violacoes: [
          {
            rn: 'RN16',
            nome: 'Cancelamento',
            mensagem: 'Só quem criou a Série pode cancelá-la.',
          },
        ],
      },
    });
    for (const { id } of ocorrencias) {
      expect((await abrir(app, eduardo.id, id)).json().status).toBe('Confirmada');
    }
  });

  it('Série que não existe → 404; entrada inválida → 400; sem sessão → 401', async () => {
    const app = await umaAppAs('08:00');
    const { eduardo, serie } = await umaSerie();

    const naoExiste = await cancelarSerie(app, eduardo.id, 999, { aPartirDe: '2026-11-10' });
    const dataInvalida = await cancelarSerie(app, eduardo.id, serie.id, {
      aPartirDe: '10/11/2026',
    });
    const semSessao = await app.inject({
      method: 'POST',
      url: `/api/series/${serie.id}/cancelamento`,
      payload: { aPartirDe: '2026-11-10' },
    });

    expect(naoExiste.statusCode).toBe(404);
    expect(naoExiste.json().erro).toMatchObject({
      codigo: 'nao_encontrado',
      mensagem: 'Série 999 não encontrada.',
    });
    expect(dataInvalida.statusCode).toBe(400);
    expect(semSessao.statusCode).toBe(401);
  });
});
