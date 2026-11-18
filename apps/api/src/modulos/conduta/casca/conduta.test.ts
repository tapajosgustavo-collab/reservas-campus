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

/** Em São Paulo, em 2026. */
const as = (mesDiaHora: string) => new Date(`2026-${mesDiaHora}:00-03:00`);

const DIAS_UTEIS = {
  create: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: 7 * 60, fecha: 23 * 60 })),
};

type App = Awaited<ReturnType<typeof umaApp>>;

function verConduta(app: App, usuarioId: number, entrouEm: Date) {
  return app.inject({
    method: 'GET',
    url: '/api/conduta',
    cookies: sessaoDe(app, usuarioId, entrouEm),
  });
}

/** Uma Reserva já encerrada no Recurso e a Penalidade que ela gerou. */
async function umaPenalidade(
  usuarioId: number,
  recursoId: number,
  dados: { inicio: string; fim: string; status: 'NaoComparecimento' | 'Cancelada' | 'Concluida' },
  penalidade: {
    motivo: 'NaoComparecimento' | 'CancelamentoTardio' | 'DevolucaoAtrasada';
    em: Date;
  },
) {
  const reserva = await umaReserva(banco, { usuarioId, recursoId, ...dados });
  return banco.penalidade.create({ data: { usuarioId, reservaId: reserva.id, ...penalidade } });
}

comBanco('US02 · Ver minha conduta', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('US02 · GET /api/conduta → só as Penalidades do Usuário da sessão, da mais recente, com a Reserva de origem e se ainda contam', async () => {
    const agora = as('11-10T08:00');
    const app = await umaApp({ banco, relogio: new RelogioFixo(agora) });
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const bruno = await umUsuario(banco, 'Aluno', { nome: 'Bruno' });
    const sala = await umEspaco(banco, { nome: 'Sala 101' });
    const notebook = await umEquipamento(banco, { nome: 'Notebook Dell N-01' });

    // De mais de 30 dias atrás: continua no histórico, mas já não conta (RN19).
    const antiga = await umaPenalidade(
      ana.id,
      sala.id,
      {
        inicio: '2026-10-01T10:00:00-03:00',
        fim: '2026-10-01T12:00:00-03:00',
        status: 'NaoComparecimento',
      },
      { motivo: 'NaoComparecimento', em: as('10-01T10:15') },
    );
    const recente = await umaPenalidade(
      ana.id,
      notebook.id,
      {
        inicio: '2026-11-05T14:00:00-03:00',
        fim: '2026-11-05T16:00:00-03:00',
        status: 'Concluida',
      },
      { motivo: 'DevolucaoAtrasada', em: as('11-05T16:15') },
    );
    // Do Bruno: não aparece para a Ana.
    await umaPenalidade(
      bruno.id,
      sala.id,
      {
        inicio: '2026-11-06T10:00:00-03:00',
        fim: '2026-11-06T12:00:00-03:00',
        status: 'Cancelada',
      },
      { motivo: 'CancelamentoTardio', em: as('11-06T09:00') },
    );

    const resposta = await verConduta(app, ana.id, agora);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      suspensoAte: null,
      penalidadesQueContam: 1,
      penalidades: [
        {
          id: recente.id,
          motivo: 'DevolucaoAtrasada',
          em: '2026-11-05T16:15:00-03:00',
          contaParaSuspensao: true,
          reserva: {
            id: recente.reservaId,
            inicio: '2026-11-05T14:00:00-03:00',
            fim: '2026-11-05T16:00:00-03:00',
            recurso: { id: notebook.id, nome: 'Notebook Dell N-01', tipo: 'Equipamento' },
          },
        },
        {
          id: antiga.id,
          motivo: 'NaoComparecimento',
          em: '2026-10-01T10:15:00-03:00',
          contaParaSuspensao: false,
          reserva: {
            id: antiga.reservaId,
            inicio: '2026-10-01T10:00:00-03:00',
            fim: '2026-10-01T12:00:00-03:00',
            recurso: { id: sala.id, nome: 'Sala 101', tipo: 'Espaco' },
          },
        },
      ],
    });
  });

  it('RN19 · três faltas em 30 dias, com o servidor dormindo → suspensoAte e as três Penalidades, que já não contam (RN20)', async () => {
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const sala = await umEspaco(banco, { nome: 'Sala 101', horarios: DIAS_UTEIS });
    for (const dia of ['02', '03', '04']) {
      await umaReserva(banco, {
        usuarioId: ana.id,
        recursoId: sala.id,
        inicio: `2026-11-${dia}T10:00:00-03:00`,
        fim: `2026-11-${dia}T12:00:00-03:00`,
      });
    }
    const agora = as('11-10T08:00');
    const app = await umaApp({ banco, relogio: new RelogioFixo(agora) });

    // A primeira requisição aplica o Não comparecimento das três e a Suspensão da 3ª.
    const resposta = await verConduta(app, ana.id, agora);

    expect(resposta.statusCode).toBe(200);
    const conduta = resposta.json();
    expect(conduta).toMatchObject({
      suspensoAte: '2026-11-11T10:15:00-03:00',
      penalidadesQueContam: 0,
    });
    expect(
      conduta.penalidades.map((p: { motivo: string; em: string; contaParaSuspensao: boolean }) => ({
        motivo: p.motivo,
        em: p.em,
        contaParaSuspensao: p.contaParaSuspensao,
      })),
    ).toEqual([
      { motivo: 'NaoComparecimento', em: '2026-11-04T10:15:00-03:00', contaParaSuspensao: false },
      { motivo: 'NaoComparecimento', em: '2026-11-03T10:15:00-03:00', contaParaSuspensao: false },
      { motivo: 'NaoComparecimento', em: '2026-11-02T10:15:00-03:00', contaParaSuspensao: false },
    ]);

    // No fim da Suspensão, ela some da conduta; as Penalidades ficam no histórico.
    const depois = as('11-11T10:15');
    const app2 = await umaApp({ banco, relogio: new RelogioFixo(depois) });
    const terminada = (await verConduta(app2, ana.id, depois)).json();
    expect(terminada.suspensoAte).toBeNull();
    expect(terminada.penalidades).toHaveLength(3);
  });

  it('US02 · sem Penalidades → nada a mostrar', async () => {
    const agora = as('11-10T08:00');
    const app = await umaApp({ banco, relogio: new RelogioFixo(agora) });
    const docente = await umUsuario(banco, 'Docente');

    const resposta = await verConduta(app, docente.id, agora);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      suspensoAte: null,
      penalidadesQueContam: 0,
      penalidades: [],
    });
  });

  it('US02 · Gestor → 403: ele não reserva, então não tem conduta', async () => {
    const agora = as('11-10T08:00');
    const app = await umaApp({ banco, relogio: new RelogioFixo(agora) });
    const gestor = await umUsuario(banco, 'Gestor');

    expect((await verConduta(app, gestor.id, agora)).statusCode).toBe(403);
  });

  it('US02 · sem sessão → 401', async () => {
    const app = await umaApp({ banco });

    expect((await app.inject({ method: 'GET', url: '/api/conduta' })).statusCode).toBe(401);
  });
});
