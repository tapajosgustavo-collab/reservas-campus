#!/usr/bin/env node
// Polling do GET /api/health para aguardar a publicação da versão no Render (spec §7, #30).

/**
 * O deploy hook do Render publica a ponta da `main` no momento do build, não o commit da
 * execução. Com merges seguidos, o que entra no ar pode ser um commit mais novo que já contém o
 * esperado (#89). Pergunta isso ao GitHub: `compare/{esperado}...{noAr}` com status `ahead` ou
 * `identical`. Uma resposta por SHA no ar; erro da API conta como "não contém".
 */
export function contemCommitNoGitHub({ repositorio, token, fetchFn = fetch }) {
  const respostas = new Map();
  return async (esperado, noAr) => {
    if (!respostas.has(noAr)) {
      respostas.set(
        noAr,
        (async () => {
          const resposta = await fetchFn(
            `https://api.github.com/repos/${repositorio}/compare/${esperado}...${noAr}`,
            {
              headers: {
                Accept: 'application/vnd.github+json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            },
          );
          if (!resposta.ok) return false;
          const { status } = await resposta.json();
          return status === 'ahead' || status === 'identical';
        })().catch(() => false),
      );
    }
    return respostas.get(noAr);
  };
}

export async function esperarDeploy({
  appUrl,
  expectedSha,
  timeoutMs = 15 * 60 * 1000,
  intervaloMs = 15 * 1000,
  fetchFn = fetch,
  contemCommit,
  log = console.log,
} = {}) {
  if (!appUrl) {
    throw new Error('APP_URL não foi informada nas variáveis de ambiente.');
  }

  if (!expectedSha) {
    throw new Error('EXPECTED_SHA não foi informada nas variáveis de ambiente.');
  }

  const healthUrl = `${appUrl.replace(/\/$/, '')}/api/health`;
  const limite = Date.now() + timeoutMs;

  log(`Aguardando versão com SHA ${expectedSha} responder em ${healthUrl}...`);

  while (Date.now() <= limite) {
    try {
      const resposta = await fetchFn(healthUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (resposta.ok) {
        const dados = await resposta.json();
        log(`Resposta do health: status=${dados.status}, sha=${dados.sha}`);

        const coincide =
          dados.status === 'ok' &&
          dados.sha &&
          (dados.sha === expectedSha ||
            expectedSha.startsWith(dados.sha) ||
            dados.sha.startsWith(expectedSha));

        if (coincide) {
          log(`Deploy concluído com sucesso com o SHA ${dados.sha}!`);
          return dados;
        }

        if (dados.status === 'ok' && dados.sha && (await contemCommit?.(expectedSha, dados.sha))) {
          log(`No ar está o ${dados.sha}, mais novo e que já contém o ${expectedSha}: concluído.`);
          return dados;
        }
      } else {
        log(`Health respondeu com status HTTP ${resposta.status}`);
      }
    } catch (erro) {
      log(`Aguardando serviço inicializar... (${erro.message})`);
    }

    if (Date.now() + intervaloMs > limite) break;
    await new Promise((resolve) => setTimeout(resolve, intervaloMs));
  }

  throw new Error(`Tempo limite atingido aguardando o SHA ${expectedSha}.`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('.github/scripts/esperar-deploy.js')) {
  try {
    await esperarDeploy({
      appUrl: process.env.APP_URL,
      expectedSha: process.env.EXPECTED_SHA,
      timeoutMs: Number(process.env.TIMEOUT_MINUTOS ?? 15) * 60 * 1000,
      contemCommit: process.env.GITHUB_REPOSITORY
        ? contemCommitNoGitHub({
            repositorio: process.env.GITHUB_REPOSITORY,
            token: process.env.GITHUB_TOKEN,
          })
        : undefined,
    });
    process.exit(0);
  } catch (erro) {
    console.error(`Erro: ${erro.message}`);
    process.exit(1);
  }
}
