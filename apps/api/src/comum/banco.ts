import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';

export type Banco = PrismaClient;
export type Transacao = Prisma.TransactionClient;

export function criarBanco(url: string): Banco {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

/** Violação da exclusion constraint `reserva_sem_conflito` (a única do schema). */
export function ehConflitoNoBanco(erro: unknown): boolean {
  if (!(erro instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const causa = (erro.meta?.driverAdapterError as { cause?: { originalCode?: string } } | undefined)
    ?.cause;
  return causa?.originalCode === '23P01';
}
