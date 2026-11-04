import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';

export type Banco = PrismaClient;
export type Transacao = Prisma.TransactionClient;

/**
 * A sessão fica sempre em UTC, qualquer que seja o `TimeZone` do servidor. O `@prisma/adapter-pg` 7
 * só acerta o `timestamptz` assim: ele grava a hora UTC sem deslocamento e, na leitura, troca o
 * deslocamento que o Postgres devolve por `+00:00` (prisma#28629, #92). Num Postgres em
 * America/Sao_Paulo, sem isto, tudo ficaria 3h deslocado. Um `options` na própria URL substituiria
 * este; o pooler do Neon (PgBouncer) aceita o `-c TimeZone`, que ele acompanha por cliente.
 */
export function criarBanco(url: string): Banco {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, options: '-c TimeZone=UTC' }),
  });
}

/** Violação da exclusion constraint `reserva_sem_conflito` (a única do schema). */
export function ehConflitoNoBanco(erro: unknown): boolean {
  if (!(erro instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const causa = (erro.meta?.driverAdapterError as { cause?: { originalCode?: string } } | undefined)
    ?.cause;
  return causa?.originalCode === '23P01';
}
