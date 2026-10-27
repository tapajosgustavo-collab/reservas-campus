import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from './comum/banco';
import type { Status } from './generated/prisma/client';
import {
  bancoDeTeste,
  comBanco,
  esvaziar,
  URL_DO_BANCO_DE_TESTE,
  umaReserva,
  umEspaco,
  umUsuario,
} from './teste/banco';

// O SQL escrito à mão na primeira migração: segunda proteção, as regras continuam no núcleo.

let banco: Banco;

beforeAll(() => {
  if (URL_DO_BANCO_DE_TESTE) banco = bancoDeTeste();
});
afterAll(() => banco?.$disconnect());

comBanco('reserva_sem_conflito (exclusion constraint, RN01 no banco)', () => {
  beforeEach(() => esvaziar(banco));

  async function reservaDas10hAs12h(status: Status = 'Confirmada') {
    const usuario = await umUsuario(banco);
    const sala = await umEspaco(banco);
    await umaReserva(banco, {
      usuarioId: usuario.id,
      recursoId: sala.id,
      inicio: '2026-11-10T10:00:00-03:00',
      fim: '2026-11-10T12:00:00-03:00',
      status,
    });
    return { usuarioId: usuario.id, recursoId: sala.id };
  }

  it.each<Status>(['Pendente', 'Confirmada', 'EmUso'])(
    'existe 10h–12h %s, outra 11h–13h → recusada',
    async (status) => {
      const dono = await reservaDas10hAs12h(status);

      await expect(
        umaReserva(banco, {
          ...dono,
          inicio: '2026-11-10T11:00:00-03:00',
          fim: '2026-11-10T13:00:00-03:00',
        }),
      ).rejects.toThrow(/reserva_sem_conflito/);
    },
  );

  it('existe 10h–12h, outra 12h–14h (só se encostam) → aceita', async () => {
    const dono = await reservaDas10hAs12h();

    await umaReserva(banco, {
      ...dono,
      inicio: '2026-11-10T12:00:00-03:00',
      fim: '2026-11-10T14:00:00-03:00',
    });

    expect(await banco.reserva.count()).toBe(2);
  });

  it.each<Status>(['Cancelada', 'Recusada', 'Expirada', 'Concluida', 'NaoComparecimento'])(
    'existe 10h–12h %s (não ativa), outra 10h–12h → aceita',
    async (status) => {
      const dono = await reservaDas10hAs12h(status);

      await umaReserva(banco, {
        ...dono,
        inicio: '2026-11-10T10:00:00-03:00',
        fim: '2026-11-10T12:00:00-03:00',
      });

      expect(await banco.reserva.count()).toBe(2);
    },
  );

  it('o mesmo Intervalo em outro Recurso → aceita', async () => {
    const { usuarioId } = await reservaDas10hAs12h();
    const outraSala = await umEspaco(banco);

    await umaReserva(banco, {
      usuarioId,
      recursoId: outraSala.id,
      inicio: '2026-11-10T10:00:00-03:00',
      fim: '2026-11-10T12:00:00-03:00',
    });

    expect(await banco.reserva.count()).toBe(2);
  });

  it('fim igual ao início → recusada (reserva_fim_depois_do_inicio)', async () => {
    const usuario = await umUsuario(banco);
    const sala = await umEspaco(banco);

    await expect(
      umaReserva(banco, {
        usuarioId: usuario.id,
        recursoId: sala.id,
        inicio: '2026-11-10T10:00:00-03:00',
        fim: '2026-11-10T10:00:00-03:00',
      }),
    ).rejects.toThrow(/reserva_fim_depois_do_inicio/);
  });
});

comBanco('recurso_campos_por_tipo', () => {
  beforeEach(() => esvaziar(banco));

  it.each([
    { tipo: 'Espaco' as const, capacidade: 40, patrimonio: null, aceito: true },
    { tipo: 'Espaco' as const, capacidade: null, patrimonio: null, aceito: false },
    { tipo: 'Espaco' as const, capacidade: 0, patrimonio: null, aceito: false },
    { tipo: 'Espaco' as const, capacidade: 40, patrimonio: 'P-123', aceito: false },
    { tipo: 'Equipamento' as const, capacidade: null, patrimonio: 'P-123', aceito: true },
    { tipo: 'Equipamento' as const, capacidade: null, patrimonio: null, aceito: false },
    { tipo: 'Equipamento' as const, capacidade: 1, patrimonio: 'P-123', aceito: false },
  ])(
    '$tipo com capacidade $capacidade e patrimônio $patrimonio → aceito: $aceito',
    async ({ aceito, ...campos }) => {
      const gestor = await umUsuario(banco, 'Gestor');
      const criar = banco.recurso.create({
        data: { ...campos, nome: 'Recurso', restrito: false, gestorId: gestor.id },
      });

      if (aceito) await expect(criar).resolves.toBeDefined();
      else await expect(criar).rejects.toThrow(/recurso_campos_por_tipo/);
    },
  );
});

comBanco('horario_valido', () => {
  beforeEach(() => esvaziar(banco));

  it.each([
    { diaSemana: 1, abre: 7 * 60, fecha: 23 * 60, aceito: true },
    { diaSemana: 0, abre: 0, fecha: 1440, aceito: true },
    { diaSemana: 7, abre: 7 * 60, fecha: 23 * 60, aceito: false },
    { diaSemana: -1, abre: 7 * 60, fecha: 23 * 60, aceito: false },
    { diaSemana: 1, abre: 7 * 60 + 15, fecha: 23 * 60, aceito: false },
    { diaSemana: 1, abre: 7 * 60, fecha: 23 * 60 - 10, aceito: false },
    { diaSemana: 1, abre: 12 * 60, fecha: 12 * 60, aceito: false },
    { diaSemana: 1, abre: 13 * 60, fecha: 12 * 60, aceito: false },
    { diaSemana: 1, abre: 7 * 60, fecha: 1470, aceito: false },
  ])('dia $diaSemana, $abre–$fecha min → aceito: $aceito', async ({ aceito, ...horario }) => {
    const sala = await umEspaco(banco);
    const criar = banco.horarioFuncionamento.create({ data: { ...horario, recursoId: sala.id } });

    if (aceito) await expect(criar).resolves.toBeDefined();
    else await expect(criar).rejects.toThrow(/horario_valido/);
  });
});

comBanco('indisponibilidade_fim', () => {
  beforeEach(() => esvaziar(banco));

  it.each([
    { fim: null, aceito: true },
    { fim: '2026-11-12T08:00:00-03:00', aceito: true },
    { fim: '2026-11-10T08:00:00-03:00', aceito: false },
    { fim: '2026-11-09T08:00:00-03:00', aceito: false },
  ])('início 10/11 08:00, fim $fim → aceito: $aceito', async ({ fim, aceito }) => {
    const sala = await umEspaco(banco);
    const criar = banco.indisponibilidade.create({
      data: {
        recursoId: sala.id,
        inicio: new Date('2026-11-10T08:00:00-03:00'),
        fim: fim ? new Date(fim) : null,
        motivo: 'Manutenção',
        criadaEm: new Date('2026-11-01T08:00:00-03:00'),
      },
    });

    if (aceito) await expect(criar).resolves.toBeDefined();
    else await expect(criar).rejects.toThrow(/indisponibilidade_fim/);
  });
});

comBanco('Índices únicos parciais da Notificação', () => {
  beforeEach(() => esvaziar(banco));

  async function umaReservaComDono() {
    const usuario = await umUsuario(banco);
    const sala = await umEspaco(banco);
    return umaReserva(banco, {
      usuarioId: usuario.id,
      recursoId: sala.id,
      inicio: '2026-11-10T10:00:00-03:00',
      fim: '2026-11-10T12:00:00-03:00',
    });
  }

  function notificar(dados: {
    destinatarioId: number;
    tipo: 'Lembrete' | 'Aprovacao' | 'FimSuspensao';
    reservaId?: number;
    suspensaoId?: number;
  }) {
    return banco.notificacao.create({
      data: { ...dados, mensagem: 'Mensagem', em: new Date('2026-11-10T09:00:00-03:00') },
    });
  }

  it('um segundo Lembrete da mesma Reserva → recusado', async () => {
    const reserva = await umaReservaComDono();
    const lembrete = { destinatarioId: reserva.usuarioId, tipo: 'Lembrete' as const };
    await notificar({ ...lembrete, reservaId: reserva.id });

    await expect(notificar({ ...lembrete, reservaId: reserva.id })).rejects.toThrow();
    expect(await banco.notificacao.count()).toBe(1);
  });

  it('outros tipos podem se repetir na mesma Reserva', async () => {
    const reserva = await umaReservaComDono();
    const aprovacao = { destinatarioId: reserva.usuarioId, tipo: 'Aprovacao' as const };

    await notificar({ ...aprovacao, reservaId: reserva.id });
    await notificar({ ...aprovacao, reservaId: reserva.id });

    expect(await banco.notificacao.count()).toBe(2);
  });

  it('um segundo aviso de fim da mesma Suspensão → recusado', async () => {
    const usuario = await umUsuario(banco);
    const suspensao = await banco.suspensao.create({
      data: {
        usuarioId: usuario.id,
        inicio: new Date('2026-11-10T10:15:00-03:00'),
        fim: new Date('2026-11-17T10:15:00-03:00'),
      },
    });
    const aviso = { destinatarioId: usuario.id, tipo: 'FimSuspensao' as const };
    await notificar({ ...aviso, suspensaoId: suspensao.id });

    await expect(notificar({ ...aviso, suspensaoId: suspensao.id })).rejects.toThrow();
    expect(await banco.notificacao.count()).toBe(1);
  });
});
