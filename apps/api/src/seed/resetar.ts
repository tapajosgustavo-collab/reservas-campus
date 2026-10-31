import type { Banco } from '../comum/banco';
import { semear } from './semear';

/**
 * Esvazia todas as tabelas (menos migrações) e recarrega o seed de demonstração (RNF10, #30).
 * Usado pelo workflow manual de reset em produção e para testes.
 */
export async function esvaziarBanco(banco: Banco): Promise<void> {
  const tabelas = await banco.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tabelas.length > 0) {
    const lista = tabelas.map(({ tablename }) => `"${tablename}"`).join(', ');
    await banco.$executeRawUnsafe(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`);
  }
}

export async function resetar(banco: Banco): Promise<'resetado'> {
  await esvaziarBanco(banco);
  await semear(banco);
  return 'resetado';
}
