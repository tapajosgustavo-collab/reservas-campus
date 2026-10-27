import { describe } from 'vitest';
import { criarBanco, type Banco } from '../comum/banco';
import type { Perfil, Status } from '../generated/prisma/client';

/**
 * Banco só dos testes: cada teste começa com `esvaziar`, então nunca aponte para o banco do dia a dia.
 * O `vitest.config.ts` aplica as migrações nele antes da suíte.
 */
export const URL_DO_BANCO_DE_TESTE = process.env.DATABASE_URL_TESTE;

// Sem DATABASE_URL_TESTE estes testes são pulados (aparecem como "skipped").
// O #26 torna o banco obrigatório no CI, com um banco por worker.
export const comBanco = describe.skipIf(!URL_DO_BANCO_DE_TESTE);

export function bancoDeTeste(): Banco {
  if (!URL_DO_BANCO_DE_TESTE) throw new Error('Defina DATABASE_URL_TESTE.');
  if (URL_DO_BANCO_DE_TESTE === process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL_TESTE é o banco do dia a dia: os testes apagariam tudo nele.');
  }
  return criarBanco(URL_DO_BANCO_DE_TESTE);
}

/** `TRUNCATE` de todas as tabelas, menos o histórico de migrações. */
export async function esvaziar(banco: Banco) {
  const tabelas = await banco.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const lista = tabelas.map(({ tablename }) => `"${tablename}"`).join(', ');
  await banco.$executeRawUnsafe(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`);
}

// Fábricas mínimas; o #26 traz as completas (umaReserva()…).
let sequencia = 0;

export function umUsuario(banco: Banco, perfil: Perfil = 'Aluno') {
  sequencia++;
  return banco.usuario.create({
    data: { email: `usuario${sequencia}.teste@unifesp.br`, nome: `Usuário ${sequencia}`, perfil },
  });
}

export async function umEspaco(banco: Banco) {
  const gestor = await umUsuario(banco, 'Gestor');
  return banco.recurso.create({
    data: {
      tipo: 'Espaco',
      nome: 'Sala 101',
      capacidade: 40,
      restrito: false,
      gestorId: gestor.id,
    },
  });
}

export function umaReserva(
  banco: Banco,
  dados: { usuarioId: number; recursoId: number; inicio: string; fim: string; status?: Status },
) {
  return banco.reserva.create({
    data: {
      ...dados,
      inicio: new Date(dados.inicio),
      fim: new Date(dados.fim),
      status: dados.status ?? 'Confirmada',
      criadaEm: new Date('2026-11-01T08:00:00-03:00'),
    },
  });
}
