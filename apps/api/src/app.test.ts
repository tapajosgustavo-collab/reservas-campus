import { afterEach, describe, expect, it } from 'vitest';
import { construirApp } from './app';

const abertos: Awaited<ReturnType<typeof construirApp>>[] = [];

async function umaApp() {
  const app = await construirApp({ sha: 'abc1234' });
  abertos.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(abertos.splice(0).map((app) => app.close()));
});

describe('GET /api/health', () => {
  it('responde ok com o SHA em execução, sem sessão', async () => {
    const app = await umaApp();

    const resposta = await app.inject({ method: 'GET', url: '/api/health' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: 'ok', sha: 'abc1234' });
  });
});

describe('RNF06 · Documentação da API', () => {
  it('GET /api/openapi.json descreve o health a partir do schema Zod', async () => {
    const app = await umaApp();

    const resposta = await app.inject({ method: 'GET', url: '/api/openapi.json' });

    expect(resposta.statusCode).toBe(200);
    const documento = resposta.json();
    expect(documento.openapi).toMatch(/^3\./);
    expect(
      documento.paths['/api/health'].get.responses['200'].content['application/json'].schema,
    ).toMatchObject({
      type: 'object',
      properties: { status: { enum: ['ok'] }, sha: { type: 'string' } },
      required: ['status', 'sha'],
    });
  });

  it('GET /api/docs serve o Swagger UI', async () => {
    const app = await umaApp();

    const resposta = await app.inject({ method: 'GET', url: '/api/docs' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toMatch(/text\/html/);
  });
});
