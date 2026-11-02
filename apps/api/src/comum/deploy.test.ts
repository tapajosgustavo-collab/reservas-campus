import { describe, expect, it } from 'vitest';
import { contemCommitNoGitHub, esperarDeploy } from '../../../../.github/scripts/esperar-deploy.js';

describe('Deploy · esperarDeploy', () => {
  it('exige APP_URL', async () => {
    await expect(esperarDeploy({ expectedSha: 'abc' })).rejects.toThrow(
      'APP_URL não foi informada nas variáveis de ambiente.',
    );
  });

  it('exige EXPECTED_SHA', async () => {
    await expect(esperarDeploy({ appUrl: 'https://exemplo.com' })).rejects.toThrow(
      'EXPECTED_SHA não foi informada nas variáveis de ambiente.',
    );
  });

  it('retorna os dados quando o health responde ok com o SHA esperado', async () => {
    const fetchMock = async () =>
      new Response(JSON.stringify({ status: 'ok', sha: 'abc1234' }), { status: 200 });

    const resultado = await esperarDeploy({
      appUrl: 'https://exemplo.com',
      expectedSha: 'abc1234',
      fetchFn: fetchMock as typeof fetch,
      intervaloMs: 1,
      timeoutMs: 100,
      log: () => {},
    });

    expect(resultado).toEqual({ status: 'ok', sha: 'abc1234' });
  });

  it('aceita quando o SHA retornado é prefixo do commit esperado (short SHA)', async () => {
    const fetchMock = async () =>
      new Response(JSON.stringify({ status: 'ok', sha: 'abc1234' }), { status: 200 });

    const resultado = await esperarDeploy({
      appUrl: 'https://exemplo.com',
      expectedSha: 'abc1234567890abcdef',
      fetchFn: fetchMock as typeof fetch,
      intervaloMs: 1,
      timeoutMs: 100,
      log: () => {},
    });

    expect(resultado).toEqual({ status: 'ok', sha: 'abc1234' });
  });

  it('re-tenta quando o health responde com versão anterior e conclui na nova', async () => {
    let chamada = 0;
    const fetchMock = async () => {
      chamada++;
      const sha = chamada === 1 ? 'versao-antiga' : 'versao-nova';
      return new Response(JSON.stringify({ status: 'ok', sha }), { status: 200 });
    };

    const resultado = await esperarDeploy({
      appUrl: 'https://exemplo.com',
      expectedSha: 'versao-nova',
      fetchFn: fetchMock as typeof fetch,
      intervaloMs: 1,
      timeoutMs: 100,
      log: () => {},
    });

    expect(resultado).toEqual({ status: 'ok', sha: 'versao-nova' });
    expect(chamada).toBe(2);
  });

  it('aceita quando o SHA no ar é mais novo e já contém o esperado (outro merge publicado por cima, #89)', async () => {
    const fetchMock = async () =>
      new Response(JSON.stringify({ status: 'ok', sha: 'versao-mais-nova' }), { status: 200 });
    const perguntas: string[] = [];

    const resultado = await esperarDeploy({
      appUrl: 'https://exemplo.com',
      expectedSha: 'versao-do-merge',
      fetchFn: fetchMock as typeof fetch,
      contemCommit: async (esperado, noAr) => {
        perguntas.push(`${esperado}...${noAr}`);
        return true;
      },
      intervaloMs: 1,
      timeoutMs: 100,
      log: () => {},
    });

    expect(resultado).toEqual({ status: 'ok', sha: 'versao-mais-nova' });
    expect(perguntas).toEqual(['versao-do-merge...versao-mais-nova']);
  });

  it('continua esperando quando o SHA no ar é mais antigo (não contém o esperado)', async () => {
    const fetchMock = async () =>
      new Response(JSON.stringify({ status: 'ok', sha: 'versao-antiga' }), { status: 200 });

    await expect(
      esperarDeploy({
        appUrl: 'https://exemplo.com',
        expectedSha: 'versao-nova',
        fetchFn: fetchMock as typeof fetch,
        contemCommit: async () => false,
        intervaloMs: 1,
        timeoutMs: 10,
        log: () => {},
      }),
    ).rejects.toThrow('Tempo limite atingido');
  });

  it('falha por timeout se o health nunca responder com a versão esperada', async () => {
    const fetchMock = async () =>
      new Response(JSON.stringify({ status: 'ok', sha: 'versao-antiga' }), { status: 200 });

    await expect(
      esperarDeploy({
        appUrl: 'https://exemplo.com',
        expectedSha: 'versao-nova',
        fetchFn: fetchMock as typeof fetch,
        intervaloMs: 1,
        timeoutMs: 10,
        log: () => {},
      }),
    ).rejects.toThrow('Tempo limite atingido');
  });
});

describe('Deploy · contemCommitNoGitHub', () => {
  function respostaDoCompare(status: string) {
    return async (url: string | URL | Request) => {
      chamadas.push(String(url));
      return new Response(JSON.stringify({ status }), { status: 200 });
    };
  }
  let chamadas: string[] = [];

  it.each([
    { status: 'ahead', contem: true },
    { status: 'identical', contem: true },
    { status: 'behind', contem: false },
    { status: 'diverged', contem: false },
  ])('compare "$status" → contém = $contem', async ({ status, contem }) => {
    chamadas = [];
    const contemCommit = contemCommitNoGitHub({
      repositorio: 'dono/repo',
      fetchFn: respostaDoCompare(status) as typeof fetch,
    });

    expect(await contemCommit('aaa111', 'bbb222')).toBe(contem);
    expect(chamadas).toEqual(['https://api.github.com/repos/dono/repo/compare/aaa111...bbb222']);
  });

  it('pergunta uma vez só por SHA no ar', async () => {
    chamadas = [];
    const contemCommit = contemCommitNoGitHub({
      repositorio: 'dono/repo',
      fetchFn: respostaDoCompare('behind') as typeof fetch,
    });

    await contemCommit('aaa111', 'bbb222');
    await contemCommit('aaa111', 'bbb222');

    expect(chamadas).toHaveLength(1);
  });

  it('erro da API do GitHub conta como "não contém" (o deploy continua esperando)', async () => {
    const contemCommit = contemCommitNoGitHub({
      repositorio: 'dono/repo',
      fetchFn: (async () => new Response('{}', { status: 404 })) as typeof fetch,
    });

    expect(await contemCommit('aaa111', 'bbb222')).toBe(false);
  });
});
