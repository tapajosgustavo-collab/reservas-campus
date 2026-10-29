import { describe } from 'vitest';
import { criarBanco, type Banco } from '../comum/banco';
import type { Perfil, Prisma } from '../generated/prisma/client';
import { urlDoWorker } from './url-do-banco';

/**
 * Banco deste worker do Vitest (`reservas_teste_N`), uma cópia do `DATABASE_URL_TESTE` que o
 * `bancos-por-worker.ts` cria já migrada. Cada teste começa com `esvaziar`; os outros workers
 * têm o banco deles, então os arquivos rodam em paralelo.
 */
export const URL_DO_BANCO_DE_TESTE = process.env.DATABASE_URL_TESTE
  ? urlDoWorker(process.env.DATABASE_URL_TESTE, Number(process.env.VITEST_POOL_ID ?? 1))
  : undefined;

// Sem DATABASE_URL_TESTE estes testes são pulados (aparecem como "skipped"). No CI o
// `bancos-por-worker.ts` recusa rodar sem ele.
export const comBanco = describe.skipIf(!URL_DO_BANCO_DE_TESTE);

export function bancoDeTeste(): Banco {
  if (!URL_DO_BANCO_DE_TESTE) throw new Error('Defina DATABASE_URL_TESTE.');
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

// Fábricas: cada uma cria o mínimo válido e aceita sobrescrever qualquer campo. O que o teste
// confere ele passa explicitamente; o resto vem daqui. Nunca use o seed nos testes.
let sequencia = 0;
const proximo = () => ++sequencia;

/** Início e fim padrão das fábricas: terça, 10/11/2026, 10h–12h em São Paulo. */
export const INTERVALO_PADRAO = {
  inicio: '2026-11-10T10:00:00-03:00',
  fim: '2026-11-10T12:00:00-03:00',
} as const;

export function umUsuario(
  banco: Banco,
  perfil: Perfil = 'Aluno',
  dados: Partial<Prisma.UsuarioUncheckedCreateInput> = {},
) {
  const n = proximo();
  return banco.usuario.create({
    data: { email: `usuario${n}.teste@unifesp.br`, nome: `Usuário ${n}`, perfil, ...dados },
  });
}

/** Espaço com Capacidade 40 e um Gestor novo, se não vier `gestorId`. */
export async function umEspaco(
  banco: Banco,
  dados: Partial<Prisma.RecursoUncheckedCreateInput> = {},
) {
  const gestorId = dados.gestorId ?? (await umUsuario(banco, 'Gestor')).id;
  return banco.recurso.create({
    data: { tipo: 'Espaco', nome: `Sala ${proximo()}`, capacidade: 40, ...dados, gestorId },
  });
}

/** Equipamento com número de patrimônio único e um Gestor novo, se não vier `gestorId`. */
export async function umEquipamento(
  banco: Banco,
  dados: Partial<Prisma.RecursoUncheckedCreateInput> = {},
) {
  const gestorId = dados.gestorId ?? (await umUsuario(banco, 'Gestor')).id;
  const n = proximo();
  return banco.recurso.create({
    data: {
      tipo: 'Equipamento',
      nome: `Projetor ${n}`,
      patrimonio: `PAT-${String(n).padStart(5, '0')}`,
      ...dados,
      gestorId,
    },
  });
}

type DadosDaReserva = Omit<Partial<Prisma.ReservaUncheckedCreateInput>, 'inicio' | 'fim'> & {
  inicio?: string;
  fim?: string;
};

/**
 * Reserva Confirmada no `INTERVALO_PADRAO`, de um Aluno novo num Espaço novo, a não ser que
 * venham `usuarioId`, `recursoId`, `inicio`, `fim` ou `status`. Datas em ISO com deslocamento.
 */
export async function umaReserva(banco: Banco, dados: DadosDaReserva = {}) {
  const usuarioId = dados.usuarioId ?? (await umUsuario(banco)).id;
  const recursoId = dados.recursoId ?? (await umEspaco(banco)).id;
  return banco.reserva.create({
    data: {
      status: 'Confirmada',
      criadaEm: new Date('2026-11-01T08:00:00-03:00'),
      ...dados,
      usuarioId,
      recursoId,
      inicio: new Date(dados.inicio ?? INTERVALO_PADRAO.inicio),
      fim: new Date(dados.fim ?? INTERVALO_PADRAO.fim),
    },
  });
}
