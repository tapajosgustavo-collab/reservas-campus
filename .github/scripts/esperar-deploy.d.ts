export interface OpcoesEsperarDeploy {
  appUrl?: string;
  expectedSha?: string;
  timeoutMs?: number;
  intervaloMs?: number;
  fetchFn?: typeof fetch;
  /** Se o SHA no ar já contém o esperado (commit mais novo publicado por cima, #89). */
  contemCommit?: (esperado: string, noAr: string) => Promise<boolean>;
  log?: (msg: string) => void;
}

export function contemCommitNoGitHub(opcoes: {
  repositorio: string;
  token?: string;
  fetchFn?: typeof fetch;
}): (esperado: string, noAr: string) => Promise<boolean>;

export function esperarDeploy(
  opcoes?: OpcoesEsperarDeploy,
): Promise<{ status?: string; sha?: string }>;
