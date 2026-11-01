import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from '../../../comum/banco';
import { RelogioFixo } from '../../../comum/relogio';
import { umaApp } from '../../../teste/app';
import { bancoDeTeste, comBanco, esvaziar, umUsuario } from '../../../teste/banco';

let banco: Banco;

comBanco('US01 · Entrar no sistema', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('POST /api/sessao com e-mail cadastrado → 200 com o Usuário, o agora e o cookie', async () => {
    const app = await umaApp({ banco });
    const ana = await umUsuario(banco, 'Aluno', {
      email: 'ana.demo@unifesp.br',
      nome: 'Ana Souza',
    });

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/sessao',
      payload: { email: 'ana.demo@unifesp.br' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      usuario: { id: ana.id, nome: 'Ana Souza', email: 'ana.demo@unifesp.br', perfil: 'Aluno' },
      agora: '2026-11-10T08:00:00-03:00',
      demo: false,
    });
    expect(resposta.cookies.find(({ name }) => name === 'sessao')).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
    });
  });

  it.each([
    { email: 'ana@gmail.com', mensagem: 'US01 · Só e-mails @unifesp.br entram no sistema.' },
    {
      email: 'zeca.demo@unifesp.br',
      mensagem:
        'US01 · O e-mail zeca.demo@unifesp.br não está cadastrado. Escolha alguém em "Entrar como…".',
    },
  ])(
    'POST /api/sessao com $email → 422 citando a US01, sem cookie',
    async ({ email, mensagem }) => {
      const app = await umaApp({ banco });
      await umUsuario(banco, 'Aluno', { email: 'ana.demo@unifesp.br' });

      const resposta = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email } });

      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toEqual({
        erro: { codigo: 'regra_violada', mensagem, violacoes: [] },
      });
      expect(resposta.cookies.find(({ name }) => name === 'sessao')).toBeUndefined();
    },
  );

  it('GET /api/sessao com o cookie do login → o mesmo Usuário', async () => {
    const app = await umaApp({ banco });
    const dora = await umUsuario(banco, 'Gestor', { email: 'dora.demo@unifesp.br', nome: 'Dora' });
    const cookies = await entrar(app, 'dora.demo@unifesp.br');

    const resposta = await app.inject({ method: 'GET', url: '/api/sessao', cookies });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      usuario: { id: dora.id, nome: 'Dora', email: 'dora.demo@unifesp.br', perfil: 'Gestor' },
      agora: '2026-11-10T08:00:00-03:00',
      demo: false,
    });
  });

  it('com DEMO=1, a sessão avisa a tela (demo: true)', async () => {
    const app = await umaApp({ banco, demo: true });
    await umUsuario(banco, 'Aluno', { email: 'ana.demo@unifesp.br' });
    const cookies = await entrar(app, 'ana.demo@unifesp.br');

    const resposta = await app.inject({ method: 'GET', url: '/api/sessao', cookies });

    expect(resposta.json().demo).toBe(true);
  });

  it('GET /api/sessao sem sessão → 401 nao_autenticado', async () => {
    const app = await umaApp({ banco });

    const resposta = await app.inject({ method: 'GET', url: '/api/sessao' });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json().erro.codigo).toBe('nao_autenticado');
  });

  it('DELETE /api/sessao → 204, e o cookie que ele devolve não entra mais', async () => {
    const app = await umaApp({ banco });
    await umUsuario(banco, 'Aluno', { email: 'ana.demo@unifesp.br' });
    const cookies = await entrar(app, 'ana.demo@unifesp.br');

    const saida = await app.inject({ method: 'DELETE', url: '/api/sessao', cookies });
    const depois = await app.inject({
      method: 'GET',
      url: '/api/sessao',
      cookies: cookiesDe(saida),
    });

    expect(saida.statusCode).toBe(204);
    expect(depois.statusCode).toBe(401);
  });

  it('DELETE /api/sessao com a sessão já vencida → 204, e o cookie é apagado', async () => {
    const relogio = new RelogioFixo(new Date('2026-11-10T08:00:00-03:00'));
    const app = await umaApp({ banco, relogio });
    await umUsuario(banco, 'Aluno', { email: 'ana.demo@unifesp.br' });
    const cookies = await entrar(app, 'ana.demo@unifesp.br');

    relogio.avancar(9 * 60);
    const saida = await app.inject({ method: 'DELETE', url: '/api/sessao', cookies });

    expect(saida.statusCode).toBe(204);
    expect(saida.cookies.find(({ name }) => name === 'sessao')).toMatchObject({ value: '' });
  });

  it.each([
    { minutos: 8 * 60 - 1, status: 200, quando: '7h59 depois do login → ainda vale' },
    { minutos: 8 * 60, status: 401, quando: '8h depois do login → expirou' },
  ])('a sessão dura 8h pelo relógio da API: $quando', async ({ minutos, status }) => {
    const relogio = new RelogioFixo(new Date('2026-11-10T08:00:00-03:00'));
    const app = await umaApp({ banco, relogio });
    await umUsuario(banco, 'Aluno', { email: 'ana.demo@unifesp.br' });
    const cookies = await entrar(app, 'ana.demo@unifesp.br');

    relogio.avancar(minutos);
    const resposta = await app.inject({ method: 'GET', url: '/api/sessao', cookies });

    expect(resposta.statusCode).toBe(status);
  });

  it('o relógio voltou para antes do login (demo reiniciada) → a sessão antiga não vale', async () => {
    const relogio = new RelogioFixo(new Date('2026-11-10T10:00:00-03:00'));
    const app = await umaApp({ banco, relogio });
    await umUsuario(banco, 'Aluno', { email: 'ana.demo@unifesp.br' });
    const cookies = await entrar(app, 'ana.demo@unifesp.br');

    relogio.ir(new Date('2026-11-10T08:00:00-03:00'));
    const resposta = await app.inject({ method: 'GET', url: '/api/sessao', cookies });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json().erro.codigo).toBe('nao_autenticado');
  });

  it('o cookie também expira em 8h no navegador', async () => {
    const app = await umaApp({ banco });
    await umUsuario(banco, 'Aluno', { email: 'ana.demo@unifesp.br' });

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/sessao',
      payload: { email: 'ana.demo@unifesp.br' },
    });

    expect(resposta.cookies.find(({ name }) => name === 'sessao')?.maxAge).toBe(8 * 60 * 60);
  });

  it('GET /api/usuarios-demo, sem sessão → nome, e-mail e Perfil, por Perfil e nome', async () => {
    const app = await umaApp({ banco });
    await umUsuario(banco, 'Gestor', { email: 'dora.demo@unifesp.br', nome: 'Dora Alves' });
    await umUsuario(banco, 'Aluno', { email: 'bruno.demo@unifesp.br', nome: 'Bruno Lima' });
    await umUsuario(banco, 'Docente', { email: 'eduardo.demo@unifesp.br', nome: 'Eduardo Prado' });
    await umUsuario(banco, 'Aluno', { email: 'ana.demo@unifesp.br', nome: 'Ana Souza' });

    const resposta = await app.inject({ method: 'GET', url: '/api/usuarios-demo' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual([
      { nome: 'Ana Souza', email: 'ana.demo@unifesp.br', perfil: 'Aluno' },
      { nome: 'Bruno Lima', email: 'bruno.demo@unifesp.br', perfil: 'Aluno' },
      { nome: 'Eduardo Prado', email: 'eduardo.demo@unifesp.br', perfil: 'Docente' },
      { nome: 'Dora Alves', email: 'dora.demo@unifesp.br', perfil: 'Gestor' },
    ]);
  });
});

type App = Awaited<ReturnType<typeof umaApp>>;
type Resposta = Awaited<ReturnType<App['inject']>>;

function cookiesDe(resposta: Resposta): Record<string, string> {
  return Object.fromEntries(resposta.cookies.map(({ name, value }) => [name, value]));
}

/** Entra pela rota de verdade e devolve o cookie para as próximas requisições. */
async function entrar(app: App, email: string) {
  const resposta = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email } });
  expect(resposta.statusCode).toBe(200);
  return cookiesDe(resposta);
}
