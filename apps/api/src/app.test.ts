import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { relogioDoSistema, RelogioFixo } from './comum/relogio';
import { umaApp } from './teste/app';

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

describe('Envelope de erro', () => {
  it('rota que não existe → 404 nao_encontrado no envelope', async () => {
    const app = await umaApp();

    const resposta = await app.inject({ method: 'GET', url: '/api/nao-existe' });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'nao_encontrado',
        mensagem: 'Rota não encontrada: GET /api/nao-existe',
        violacoes: [],
      },
    });
  });
});

describe('RNF05 · Tela na mesma origem', () => {
  // Um build da tela de mentira, como o `apps/web/dist` que a imagem Docker leva.
  let tela: string;
  beforeAll(async () => {
    tela = await mkdtemp(join(tmpdir(), 'tela-'));
    await mkdir(join(tela, 'assets'));
    await writeFile(join(tela, 'index.html'), '<!doctype html><title>Reservas do Campus</title>');
    await writeFile(join(tela, 'assets', 'principal.js'), 'console.log("tela");');
  });

  // O banco de `umaApp` não existe: uma rota da tela dentro da transação responderia 500.
  it('GET / serve o index.html da tela, sem passar pela transação', async () => {
    const app = await umaApp({ tela });

    const resposta = await app.inject({ method: 'GET', url: '/' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toMatch(/text\/html/);
    expect(resposta.body).toContain('<title>Reservas do Campus</title>');
  });

  it('serve os arquivos do build', async () => {
    const app = await umaApp({ tela });

    const resposta = await app.inject({ method: 'GET', url: '/assets/principal.js' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toMatch(/javascript/);
  });

  it('endereço da tela aberto direto (recarregar a página) também recebe o index.html', async () => {
    const app = await umaApp({ tela });

    const resposta = await app.inject({ method: 'GET', url: '/reservas?semana=2026-11-09' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.body).toContain('<title>Reservas do Campus</title>');
  });

  it.each(['/api/nao-existe', '/api'])(
    'GET %s continua 404 nao_encontrado no envelope',
    async (url) => {
      const app = await umaApp({ tela });

      const resposta = await app.inject({ method: 'GET', url });

      expect(resposta.statusCode).toBe(404);
      expect(resposta.json().erro.codigo).toBe('nao_encontrado');
    },
  );

  it('a tela não aparece no OpenAPI', async () => {
    const app = await umaApp({ tela });

    const documento = (await app.inject({ method: 'GET', url: '/api/openapi.json' })).json();

    expect(Object.keys(documento.paths).every((caminho) => caminho.startsWith('/api/'))).toBe(true);
  });

  it('sem a pasta da tela (dia a dia, com o Vite), GET / é 404', async () => {
    const app = await umaApp();

    const resposta = await app.inject({ method: 'GET', url: '/' });

    expect(resposta.statusCode).toBe(404);
  });
});

describe('RNF02 · Relógio da demo', () => {
  it('sem DEMO=1, GET e POST /api/demo/relogio não existem (404)', async () => {
    const app = await umaApp();

    const leitura = await app.inject({ method: 'GET', url: '/api/demo/relogio' });
    const mudanca = await app.inject({
      method: 'POST',
      url: '/api/demo/relogio',
      payload: { avancarMinutos: 60 },
    });

    expect(leitura.statusCode).toBe(404);
    expect(mudanca.statusCode).toBe(404);
    expect(mudanca.json().erro.codigo).toBe('nao_encontrado');
  });

  it('a rota não aparece no OpenAPI sem DEMO=1', async () => {
    const app = await umaApp();

    const documento = (await app.inject({ method: 'GET', url: '/api/openapi.json' })).json();

    expect(documento.paths['/api/demo/relogio']).toBeUndefined();
  });

  it.each([
    { corpo: {}, motivo: 'corpo vazio' },
    { corpo: { avancarMinutos: 0 }, motivo: 'avançar zero minutos' },
    { corpo: { avancarMinutos: 1.5 }, motivo: 'minutos quebrados' },
    { corpo: { ir: '2026-11-10T09:00:00' }, motivo: 'ir sem deslocamento' },
    { corpo: { ir: '2026-11-10T09:00:00-03:00', avancarMinutos: 5 }, motivo: 'os dois juntos' },
  ])('com DEMO=1, $motivo → 400 entrada_invalida', async ({ corpo }) => {
    const app = await umaApp({ demo: true });

    const resposta = await app.inject({ method: 'POST', url: '/api/demo/relogio', payload: corpo });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({
      erro: { codigo: 'entrada_invalida', violacoes: [] },
    });
  });

  it('com DEMO=1, o relógio precisa ser um RelogioFixo', async () => {
    await expect(umaApp({ demo: true, relogio: relogioDoSistema })).rejects.toThrow(
      'DEMO=1 precisa de um RelogioFixo',
    );
    await expect(
      umaApp({ demo: true, relogio: new RelogioFixo(new Date()) }),
    ).resolves.toBeDefined();
  });
});
