import { ESLint } from 'eslint';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Confere as regras de arquitetura do eslint.config.js (ADR 0001) lintando código de exemplo.
const raiz = join(import.meta.dirname, '../../..');
const eslint = new ESLint({ cwd: raiz });

async function regrasVioladas(arquivo: string, codigo: string): Promise<string[]> {
  const [resultado] = await eslint.lintText(codigo, { filePath: join(raiz, arquivo) });
  return (resultado?.messages ?? []).map((mensagem) => mensagem.ruleId ?? mensagem.message);
}

const NUCLEO = 'apps/api/src/modulos/reservas/nucleo/decidir.ts';

describe('Regra de dependência do núcleo', () => {
  it.each([
    ["import { PrismaClient } from '@prisma/client';", 'Prisma'],
    ["import { PrismaClient } from '../../../generated/prisma/client';", 'Prisma gerado'],
    ["import Fastify from 'fastify';", 'Fastify'],
    ["import type { FastifyInstance } from 'fastify';", 'tipo do Fastify'],
    ["import swagger from '@fastify/swagger';", 'plugin do Fastify'],
    ["import { salvar } from '../casca/salvar';", 'casca'],
    ["import { randomUUID } from 'node:crypto';", 'node:crypto'],
  ])('recusa %s (%s)', async (codigo) => {
    expect(await regrasVioladas(NUCLEO, `${codigo}\nexport {};`)).toContain(
      'no-restricted-imports',
    );
  });

  it.each([
    ['export const agora = Date.now();', 'Date.now()'],
    ['export const agora = new Date();', 'new Date() sem argumento'],
    ['export const agora = Date();', 'Date() sem new'],
    ['export const sorteio = Math.random();', 'Math.random'],
    ['export const id = crypto.randomUUID();', 'crypto.randomUUID'],
    ['export const agora = globalThis.Date.now();', 'Date.now() pelo globalThis'],
    ['export const id = globalThis.crypto.randomUUID();', 'randomUUID pelo globalThis'],
    ['export const agora = performance.now();', 'performance.now()'],
    ['export const agora = process.hrtime();', 'process.hrtime()'],
    ["export const f = () => import('fastify');", 'import dinâmico'],
  ])('recusa %s (%s)', async (codigo) => {
    expect(await regrasVioladas(NUCLEO, codigo)).toContain('no-restricted-syntax');
  });

  it('recusa console', async () => {
    expect(await regrasVioladas(NUCLEO, "console.log('decidiu');")).toContain('no-console');
  });

  it('aceita função pura que recebe o agora e cria Date a partir dele', async () => {
    const codigo = [
      "import { POLITICA } from '@reservas/shared';",
      "import { conflita } from './conflito';",
      'export const decidir = (agora: Date) => ({ POLITICA, conflita, fim: new Date(agora) });',
    ].join('\n');
    expect(await regrasVioladas(NUCLEO, codigo)).toEqual([]);
  });

  it('não vale na casca, que pode usar Prisma, Fastify e o núcleo do próprio módulo', async () => {
    const codigo = [
      "import type { FastifyInstance } from 'fastify';",
      "import { decidir } from '../nucleo/decidir';",
      'export const rotas = (app: FastifyInstance) => [app, decidir];',
    ].join('\n');
    expect(await regrasVioladas('apps/api/src/modulos/reservas/casca/rotas.ts', codigo)).toEqual(
      [],
    );
  });
});

describe('Fronteira dos módulos', () => {
  it.each([
    ['apps/api/src/modulos/reservas/nucleo/decidir.ts', "'../../recursos/nucleo/agenda'"],
    ['apps/api/src/modulos/reservas/casca/rotas.ts', "'../../conduta/casca/sessao'"],
    ['apps/api/src/app.ts', "'./modulos/ciclo/casca/rotas'"],
    ['apps/web/src/modulos/reservas/rotas.tsx', "'../recursos/rotas'"],
    ['apps/web/src/roteador.tsx', "'./modulos/recursos/rotas'"],
  ])('em %s, recusa importar o arquivo interno %s', async (arquivo, caminho) => {
    expect(await regrasVioladas(arquivo, `import { x } from ${caminho};\nexport { x };`)).toContain(
      'no-restricted-imports',
    );
  });

  it.each([
    ['apps/api/src/modulos/reservas/casca/rotas.ts', "'../../recursos'"],
    ['apps/api/src/modulos/reservas/casca/rotas.ts', "'../../recursos/index'"],
    ['apps/api/src/modulos/reservas/casca/rotas.ts', "'../../recursos/'"],
    ['apps/api/src/app.ts', "'./modulos/ciclo'"],
    ['apps/web/src/roteador.tsx', "'./modulos/recursos'"],
  ])('em %s, aceita importar a fachada %s', async (arquivo, caminho) => {
    expect(await regrasVioladas(arquivo, `import { x } from ${caminho};\nexport { x };`)).toEqual(
      [],
    );
  });
});

describe('Testes conferem resultados, não chamadas', () => {
  it.each(["vi.mock('../casca/salvar');", 'vi.spyOn(Math, "max");'])(
    'recusa %s',
    async (codigo) => {
      const teste = `import { vi } from 'vitest';\n${codigo}`;
      expect(await regrasVioladas('apps/api/src/app.test.ts', teste)).toContain(
        'no-restricted-properties',
      );
    },
  );
});
