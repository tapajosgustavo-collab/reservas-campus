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

/** Em São Paulo, novembro de 2026. */
const as = (diaHora: string) => new Date(`2026-11-${diaHora}:00-03:00`);

const DIAS_UTEIS = {
  create: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: 7 * 60, fecha: 23 * 60 })),
};

/** A Ana, a Sala 101 e uma Reserva Confirmada dela, das 10h às 12h, em cada dia de `faltas`. */
async function anaComFaltas(...faltas: string[]) {
  const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
  const sala = await umEspaco(banco, { nome: 'Sala 101', horarios: DIAS_UTEIS });
  for (const dia of faltas) {
    await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: sala.id,
      inicio: `2026-11-${dia}T10:00:00-03:00`,
      fim: `2026-11-${dia}T12:00:00-03:00`,
    });
  }
  return { ana, sala };
}

comBanco('Suspensão (RN09, RN19, RN20)', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('RN19_três faltas em 30 dias, com o servidor dormindo → Suspensão de 7 dias a partir da 3ª, com aviso', async () => {
    const { ana } = await anaComFaltas('02', '03', '04');
    const relogio = new RelogioFixo(as('10T08:00'));
    const app = await umaApp({ banco, relogio });

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessaoDe(app, ana.id, relogio.agora()),
    });

    expect(resposta.json().itens[0]).toMatchObject({
      tipo: 'InicioSuspensao',
      mensagem:
        'Você está suspenso até 11/11/2026 às 10:15 por acumular 3 Penalidades em 30 dias e não pode criar Reservas. As Reservas que você já tem continuam valendo.',
      em: '2026-11-04T10:15:00-03:00',
    });
    const [suspensao, ...outras] = await banco.suspensao.findMany({
      include: { penalidades: true, notificacoes: true },
    });
    expect(outras).toEqual([]);
    expect(suspensao).toMatchObject({
      usuarioId: ana.id,
      inicio: as('04T10:15'),
      fim: as('11T10:15'),
      notificacoes: [expect.objectContaining({ tipo: 'InicioSuspensao' })],
    });
    // RN20: as três ficam marcadas e não contam para a próxima.
    expect(suspensao?.penalidades.map((p) => p.em)).toEqual(
      expect.arrayContaining([as('02T10:15'), as('03T10:15'), as('04T10:15')]),
    );
    expect(suspensao?.penalidades).toHaveLength(3);
  });

  it('RN09_suspenso tenta reservar → 422 dizendo até quando; a Reserva que já tinha continua e aceita Check-in', async () => {
    const { ana, sala } = await anaComFaltas('02', '03', '04');
    const amanha = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: sala.id,
      inicio: '2026-11-10T10:00:00-03:00',
      fim: '2026-11-10T12:00:00-03:00',
    });
    const relogio = new RelogioFixo(as('10T09:50'));
    const app = await umaApp({ banco, relogio });
    const cookies = sessaoDe(app, ana.id, relogio.agora());

    const reservar = await app.inject({
      method: 'POST',
      url: '/api/reservas',
      cookies,
      payload: {
        recursoId: sala.id,
        inicio: '2026-11-12T14:00:00-03:00',
        fim: '2026-11-12T16:00:00-03:00',
        participantes: 10,
      },
    });
    expect(reservar.statusCode).toBe(422);
    expect(reservar.json().erro.violacoes).toEqual([
      {
        rn: 'RN09',
        nome: 'Suspenso não reserva',
        mensagem: 'Você está suspenso até 11/11/2026 às 10:15 e não pode criar Reservas.',
      },
    ]);

    const checkIn = await app.inject({
      method: 'POST',
      url: `/api/reservas/${amanha.id}/check-in`,
      cookies,
    });
    expect(checkIn.statusCode).toBe(200);
  });

  it('RN19_no fim da Suspensão sai o aviso de fim e o Usuário volta a reservar', async () => {
    const { ana, sala } = await anaComFaltas('02', '03', '04');
    const relogio = new RelogioFixo(as('11T10:15'));
    const app = await umaApp({ banco, relogio });
    const cookies = sessaoDe(app, ana.id, relogio.agora());

    const reservar = await app.inject({
      method: 'POST',
      url: '/api/reservas',
      cookies,
      payload: {
        recursoId: sala.id,
        inicio: '2026-11-12T14:00:00-03:00',
        fim: '2026-11-12T16:00:00-03:00',
        participantes: 10,
      },
    });
    expect(reservar.statusCode).toBe(201);

    const notificacoes = await app.inject({ method: 'GET', url: '/api/notificacoes', cookies });
    expect(notificacoes.json().itens[0]).toMatchObject({
      tipo: 'FimSuspensao',
      mensagem:
        'Sua Suspensão terminou em 11/11/2026 às 10:15. Você já pode criar Reservas de novo.',
      em: '2026-11-11T10:15:00-03:00',
    });
    expect(await banco.notificacao.count({ where: { tipo: 'FimSuspensao' } })).toBe(1);
  });

  it('RN20_a 4ª falta dentro dos mesmos 30 dias, depois da Suspensão, não suspende de novo', async () => {
    const { ana } = await anaComFaltas('02', '03', '04', '12');
    const relogio = new RelogioFixo(as('13T08:00'));
    const app = await umaApp({ banco, relogio });

    await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessaoDe(app, ana.id, relogio.agora()),
    });

    expect(await banco.penalidade.count()).toBe(4);
    expect(await banco.suspensao.count()).toBe(1);
  });

  it('RN19_faltas durante a Suspensão: a nova Suspensão cobre o fim da primeira, e só o fim da nova é avisado', async () => {
    const { ana } = await anaComFaltas('02', '03', '04');
    // Suspensa de 01/11 a 08/11 por faltas anteriores, já marcadas.
    await banco.suspensao.create({
      data: { usuarioId: ana.id, inicio: as('01T10:15'), fim: as('08T10:15') },
    });
    const relogio = new RelogioFixo(as('12T08:00'));
    const app = await umaApp({ banco, relogio });

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessaoDe(app, ana.id, relogio.agora()),
    });

    const nova = await banco.suspensao.findFirstOrThrow({ where: { inicio: as('04T10:15') } });
    expect(nova.fim).toEqual(as('11T10:15'));
    const avisos = await banco.notificacao.findMany({ where: { tipo: 'FimSuspensao' } });
    expect(avisos).toEqual([expect.objectContaining({ suspensaoId: nova.id, em: as('11T10:15') })]);
    expect(resposta.json().itens.map((n: { tipo: string }) => n.tipo)).toEqual([
      'FimSuspensao',
      'InicioSuspensao',
      'Penalidade',
      'Penalidade',
      'Penalidade',
    ]);
  });
});
