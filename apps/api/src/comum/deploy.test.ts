import { describe, expect, it } from 'vitest';
import { esperarDeploy } from '../../../../.github/scripts/esperar-deploy.js';

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
