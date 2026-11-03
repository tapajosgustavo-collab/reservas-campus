import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from './banco';
import { bancoDeTeste, comBanco, esvaziar, umEspaco, umUsuario, umaReserva } from '../teste/banco';

let banco: Banco;

// O `@prisma/adapter-pg` 7 só acerta o `timestamptz` com a sessão em UTC (prisma#28629): ele grava
// a hora UTC sem deslocamento e, na leitura, troca o deslocamento que o Postgres devolve por
// `+00:00`. Os bancos dos workers ficam em America/Sao_Paulo (`bancos-por-worker.ts`), como o
// Postgres local do grupo; no CI e no Neon, em UTC, o erro não apareceria.
comBanco('Fuso da sessão do Postgres (#92)', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('o banco do worker está em America/Sao_Paulo, como o Postgres local', async () => {
    const configuracoes = await banco.$queryRaw<{ configuracao: string }[]>`
      SELECT unnest(setconfig) AS configuracao FROM pg_db_role_setting
      WHERE setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())`;

    expect(configuracoes.map(({ configuracao }) => configuracao)).toContain(
      'TimeZone=America/Sao_Paulo',
    );
  });

  it('lê pelo Prisma o instante que o SQL gravou', async () => {
    const usuario = await umUsuario(banco);
    const recurso = await umEspaco(banco);
    await banco.$executeRaw`
      INSERT INTO "reserva" ("usuario_id", "recurso_id", "inicio", "fim", "status", "criada_em")
      VALUES (${usuario.id}, ${recurso.id}, '2026-11-04 10:00-03', '2026-11-04 12:00-03',
              'Confirmada', '2026-11-01 08:00-03')`;

    const reserva = await banco.reserva.findFirstOrThrow({ where: { recursoId: recurso.id } });

    expect(reserva.inicio.toISOString()).toBe('2026-11-04T13:00:00.000Z');
    expect(reserva.fim.toISOString()).toBe('2026-11-04T15:00:00.000Z');
  });

  it('grava pelo Prisma o instante que o SQL lê', async () => {
    const reserva = await umaReserva(banco, {
      inicio: '2026-11-04T10:00:00-03:00',
      fim: '2026-11-04T12:00:00-03:00',
    });

    // Comparado no próprio Postgres: um `timestamptz` lido pelo `$queryRaw` passaria pelo adapter.
    const [linha] = await banco.$queryRaw<{ inicioCerto: boolean; fimCerto: boolean }[]>`
      SELECT "inicio" = '2026-11-04 10:00-03' AS "inicioCerto",
             "fim" = '2026-11-04 12:00-03' AS "fimCerto"
      FROM "reserva" WHERE "id" = ${reserva.id}`;

    expect(linha).toEqual({ inicioCerto: true, fimCerto: true });
  });
});
