import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from './banco';
import { regraViolada } from './erros';
import { paraIsoSaoPaulo } from './instante';
import { RelogioFixo } from './relogio';
import { exigirPerfil, exigirSessao } from './sessao';
import { sessaoDe, umaApp } from '../teste/app';
import { bancoDeTeste, comBanco, esvaziar, umEspaco, umUsuario } from '../teste/banco';

let banco: Banco;

comBanco('Transação por requisição', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('o comando recebe o agora do relógio da app', async () => {
    const relogio = new RelogioFixo(new Date('2026-11-10T09:00:00-03:00'));
    const app = await umaApp({ banco, relogio });
    app.get('/api/teste/agora', async (request) => ({ agora: paraIsoSaoPaulo(request.agora) }));

    relogio.avancar(76);
    const resposta = await app.inject({ method: 'GET', url: '/api/teste/agora' });

    expect(resposta.json()).toEqual({ agora: '2026-11-10T10:16:00-03:00' });
  });

  it('RNF11 · requisições simultâneas rodam uma de cada vez (advisory lock)', async () => {
    const app = await umaApp({ banco });
    const intervalos: [number, number][] = [];
    app.get('/api/teste/lenta', async (request) => {
      const inicio = performance.now();
      await request.tx.$executeRaw`SELECT pg_sleep(0.2)`;
      intervalos.push([inicio, performance.now()]);
      return { ok: true };
    });

    const respostas = await Promise.all(
      Array.from({ length: 3 }, () => app.inject({ method: 'GET', url: '/api/teste/lenta' })),
    );

    expect(respostas.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    intervalos.sort(([a], [b]) => a - b);
    for (let i = 1; i < intervalos.length; i++) {
      expect(intervalos[i]![0]).toBeGreaterThanOrEqual(intervalos[i - 1]![1]);
    }
  });

  it('um erro desfaz tudo o que a requisição gravou', async () => {
    const app = await umaApp({ banco });
    app.post('/api/teste/grava-e-falha', async (request) => {
      await request.tx.usuario.create({
        data: { email: 'nao.fica@unifesp.br', nome: 'Não fica', perfil: 'Aluno' },
      });
      throw regraViolada([{ rn: 'RN99', nome: 'Regra de teste', mensagem: 'sempre falha' }]);
    });

    const resposta = await app.inject({ method: 'POST', url: '/api/teste/grava-e-falha' });

    expect(resposta.statusCode).toBe(422);
    expect(await banco.usuario.count()).toBe(0);
  });

  it('422 regra_violada traz todas as violações no envelope', async () => {
    const app = await umaApp({ banco });
    app.post('/api/teste/viola', async () => {
      throw regraViolada([
        {
          rn: 'RN01',
          nome: 'Sem Conflito',
          mensagem: 'Já existe Reserva às 10h.',
          campo: 'inicio',
        },
        { rn: 'RN02', nome: 'Intervalo válido', mensagem: 'Use múltiplos de 30 min.' },
      ]);
    });

    const resposta = await app.inject({ method: 'POST', url: '/api/teste/viola' });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'regra_violada',
        mensagem: 'Não foi possível concluir: 2 regras impedem a operação.',
        violacoes: [
          {
            rn: 'RN01',
            nome: 'Sem Conflito',
            mensagem: 'Já existe Reserva às 10h.',
            campo: 'inicio',
          },
          { rn: 'RN02', nome: 'Intervalo válido', mensagem: 'Use múltiplos de 30 min.' },
        ],
      },
    });
  });

  it('Conflito que escapa do núcleo → 409 conflito_concorrente (reserva_sem_conflito)', async () => {
    const app = await umaApp({ banco });
    const usuario = await umUsuario(banco);
    const sala = await umEspaco(banco);
    app.post('/api/teste/duas-reservas', async (request) => {
      for (const [inicio, fim] of [
        ['2026-11-10T10:00:00-03:00', '2026-11-10T12:00:00-03:00'],
        ['2026-11-10T11:00:00-03:00', '2026-11-10T13:00:00-03:00'],
      ]) {
        await request.tx.reserva.create({
          data: {
            usuarioId: usuario.id,
            recursoId: sala.id,
            inicio: new Date(inicio!),
            fim: new Date(fim!),
            status: 'Confirmada',
            criadaEm: request.agora,
          },
        });
      }
      return { ok: true };
    });

    const resposta = await app.inject({ method: 'POST', url: '/api/teste/duas-reservas' });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro.codigo).toBe('conflito_concorrente');
    expect(await banco.reserva.count()).toBe(0);
  });
});

comBanco('exigirSessao e exigirPerfil', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  async function appComRotasProtegidas() {
    const app = await umaApp({ banco });
    app.get('/api/teste/qualquer', async (request) => exigirSessao(request));
    app.get('/api/teste/gestao', async (request) => exigirPerfil(request, 'Gestor'));
    return app;
  }

  it('sem sessão → 401 nao_autenticado', async () => {
    const app = await appComRotasProtegidas();

    const resposta = await app.inject({ method: 'GET', url: '/api/teste/qualquer' });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'nao_autenticado',
        mensagem: 'Entre no sistema para continuar.',
        violacoes: [],
      },
    });
  });

  it('sessão de um Usuário que não existe mais (banco resetado) → 401', async () => {
    const app = await appComRotasProtegidas();

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/teste/qualquer',
      cookies: sessaoDe(app, 999),
    });

    expect(resposta.statusCode).toBe(401);
  });

  it('cookie adulterado → 401', async () => {
    const app = await appComRotasProtegidas();

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/teste/qualquer',
      cookies: { sessao: 'nao-e-um-cookie-valido' },
    });

    expect(resposta.statusCode).toBe(401);
  });

  it('com sessão, a rota recebe o quem da sessão', async () => {
    const app = await appComRotasProtegidas();
    const aluno = await umUsuario(banco, 'Aluno');

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/teste/qualquer',
      cookies: sessaoDe(app, aluno.id),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ id: aluno.id, perfil: 'Aluno' });
  });

  it('Perfil fora da rota → 403 proibido', async () => {
    const app = await appComRotasProtegidas();
    const aluno = await umUsuario(banco, 'Aluno');

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/teste/gestao',
      cookies: sessaoDe(app, aluno.id),
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({
      erro: { codigo: 'proibido', mensagem: 'Só Gestor pode fazer isto.', violacoes: [] },
    });
  });

  it('Perfil da rota → 200', async () => {
    const app = await appComRotasProtegidas();
    const gestor = await umUsuario(banco, 'Gestor');

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/teste/gestao',
      cookies: sessaoDe(app, gestor.id),
    });

    expect(resposta.statusCode).toBe(200);
  });

  it('o cookie é httpOnly e SameSite=Lax', async () => {
    const app = await umaApp({ banco });
    app.post('/api/teste/entrar', async (request) => {
      request.session.set('usuarioId', 1);
      return { ok: true };
    });

    const resposta = await app.inject({ method: 'POST', url: '/api/teste/entrar' });

    const cookie = resposta.cookies.find(({ name }) => name === 'sessao');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(cookie?.secure).toBeFalsy();
  });
});

comBanco('RNF02 · Relógio da demo com DEMO=1', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  async function appDaDemo() {
    const relogio = new RelogioFixo(new Date('2026-11-10T08:00:00-03:00'));
    const app = await umaApp({ banco, relogio, demo: true });
    const usuario = await umUsuario(banco);
    return { app, cookies: sessaoDe(app, usuario.id) };
  }

  it('sem sessão → 401', async () => {
    const { app } = await appDaDemo();

    const resposta = await app.inject({ method: 'GET', url: '/api/demo/relogio' });

    expect(resposta.statusCode).toBe(401);
  });

  it('GET devolve o agora com o deslocamento de São Paulo', async () => {
    const { app, cookies } = await appDaDemo();

    const resposta = await app.inject({ method: 'GET', url: '/api/demo/relogio', cookies });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ agora: '2026-11-10T08:00:00-03:00' });
  });

  it('POST {avancarMinutos: 60} leva das 08:00 às 09:00', async () => {
    const { app, cookies } = await appDaDemo();

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/demo/relogio',
      cookies,
      payload: { avancarMinutos: 60 },
    });

    expect(resposta.json()).toEqual({ agora: '2026-11-10T09:00:00-03:00' });
    const depois = await app.inject({ method: 'GET', url: '/api/demo/relogio', cookies });
    expect(depois.json()).toEqual({ agora: '2026-11-10T09:00:00-03:00' });
  });

  it('POST {ir} vai para o instante exato, em qualquer deslocamento', async () => {
    const { app, cookies } = await appDaDemo();

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/demo/relogio',
      cookies,
      payload: { ir: '2026-11-10T13:16:00Z' },
    });

    expect(resposta.json()).toEqual({ agora: '2026-11-10T10:16:00-03:00' });
  });

  it('a próxima requisição já usa o relógio novo', async () => {
    const { app, cookies } = await appDaDemo();
    app.get('/api/teste/agora', async (request) => ({ agora: paraIsoSaoPaulo(request.agora) }));

    await app.inject({
      method: 'POST',
      url: '/api/demo/relogio',
      cookies,
      payload: { avancarMinutos: 76 },
    });
    const resposta = await app.inject({ method: 'GET', url: '/api/teste/agora' });

    expect(resposta.json()).toEqual({ agora: '2026-11-10T09:16:00-03:00' });
  });
});
