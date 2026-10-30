/** A mesma URL do Postgres, apontando para outro banco do mesmo servidor. */
export function comOutroBanco(url: string, nome: string): string {
  const endereco = new URL(url);
  endereco.pathname = `/${nome}`;
  return endereco.toString();
}

/** Nome do banco no fim da URL (`reservas_teste` em `postgresql://…/reservas_teste`). */
export function nomeDoBanco(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

/**
 * Banco de um worker do Vitest: `reservas_teste_1`, `reservas_teste_2`…, cópias do
 * `DATABASE_URL_TESTE` criadas pelo `bancos-por-worker.ts` antes da suíte.
 */
export function urlDoWorker(base: string, worker: number): string {
  return comOutroBanco(base, `${nomeDoBanco(base)}_${worker}`);
}
