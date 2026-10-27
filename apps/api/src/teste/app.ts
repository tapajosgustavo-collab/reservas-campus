import { afterEach } from 'vitest';
import { construirApp, type OpcoesApp } from '../app';
import { criarBanco } from '../comum/banco';
import { RelogioFixo } from '../comum/relogio';

/** Valor fixo de teste, como o do CI (RNF14). */
export const SEGREDO_DE_TESTE = 'segredo-de-teste-com-mais-de-32-bytes!';

// Para os testes que não chegam ao banco: o Prisma só conecta na primeira consulta.
const bancoSemUso = criarBanco('postgresql://localhost:1/sem-banco');

type App = Awaited<ReturnType<typeof construirApp>>;
const abertas: App[] = [];

afterEach(async () => {
  await Promise.all(abertas.splice(0).map((app) => app.close()));
});

/** `construirApp` com `RelogioFixo` (a seam da API), fechada depois de cada teste. */
export async function umaApp(opcoes: Partial<OpcoesApp> = {}) {
  const app = await construirApp({
    relogio: new RelogioFixo(new Date('2026-11-10T08:00:00-03:00')),
    banco: bancoSemUso,
    segredoSessao: SEGREDO_DE_TESTE,
    sha: 'abc1234',
    ...opcoes,
  });
  abertas.push(app);
  return app;
}

/** Cookie de sessão de um Usuário, sem passar pela rota de login (#33). */
export function sessaoDe(app: App, usuarioId: number) {
  return { sessao: app.encodeSecureSession(app.createSecureSession({ usuarioId })) };
}
