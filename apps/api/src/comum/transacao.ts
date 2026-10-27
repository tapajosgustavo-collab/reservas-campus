import type { FastifyBaseLogger } from 'fastify';
import { sincronizar } from '../modulos/ciclo';
import type { Banco, Transacao } from './banco';
import type { Relogio } from './relogio';

declare module 'fastify' {
  interface FastifyRequest {
    /** Transação da requisição, já sob o advisory lock e sincronizada. */
    tx: Transacao;
    /** O instante da requisição: o mesmo para o `sincronizar` e para o comando. */
    agora: Date;
  }
}

/** Chave do `pg_advisory_xact_lock`: uma só para a API inteira. */
const CHAVE_DO_LOCK = 25;

// A espera pelo lock conta no tempo da transação: com uma requisição por vez,
// os limites padrão do Prisma (2 s e 5 s) estouram com poucas requisições em fila.
const LIMITES = { maxWait: 10_000, timeout: 20_000 };

/**
 * Abre uma transação, toma o advisory lock, aplica o `sincronizar(agora)` e só então roda o comando,
 * na mesma transação. O lock fica preso até o fim dela: a API atende uma requisição por vez (ADR 0001).
 */
export async function emTransacao<T>(
  banco: Banco,
  relogio: Relogio,
  log: FastifyBaseLogger,
  comando: (tx: Transacao, agora: Date) => T | Promise<T>,
): Promise<T> {
  const agora = relogio.agora();
  return banco.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAVE_DO_LOCK})`;
    const aplicados = await sincronizar(tx, agora);
    if (aplicados > 0)
      log.info({ evento: 'sincronizar_aplicou', aplicados }, 'sincronizar_aplicou');
    return comando(tx, agora);
  }, LIMITES);
}
