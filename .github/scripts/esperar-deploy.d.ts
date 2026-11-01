export interface OpcoesEsperarDeploy {
  appUrl?: string;
  expectedSha?: string;
  timeoutMs?: number;
  intervaloMs?: number;
  fetchFn?: typeof fetch;
  log?: (msg: string) => void;
}

export function esperarDeploy(
  opcoes?: OpcoesEsperarDeploy,
): Promise<{ status?: string; sha?: string }>;
