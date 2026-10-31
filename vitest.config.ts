import { defineConfig } from 'vitest/config';

// O .env da raiz é opcional; no CI as variáveis vêm do ambiente.
try {
  process.loadEnvFile(new URL('./.env', import.meta.url));
} catch {
  // sem .env
}

// As suítes ficam separadas pelo caminho (spec, "Decisões de teste"). Rode uma só com
// `npm run test:nucleo` ou `npm run test:api`, ou todas com `npm test`.
const NUCLEO = 'src/modulos/*/nucleo/**/*.test.ts';
// Testes de `comum/` que não tocam em banco nem em rede: rodam com o núcleo, sem Postgres, mas
// não contam na cobertura dele. O #26 pede o RelogioFixo como teste de exemplo da suíte nucleo.
// Um teste puro novo em `comum/` entra nesta lista; sem ela, vai para a suíte api.
const PUROS_DO_COMUM = [
  'src/comum/relogio.test.ts',
  'src/comum/instante.test.ts',
  'src/comum/tique.test.ts',
  'src/comum/deploy.test.ts',
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'nucleo',
          root: './apps/api',
          include: [NUCLEO, ...PUROS_DO_COMUM],
        },
      },
      {
        test: {
          name: 'api',
          root: './apps/api',
          include: ['src/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/generated/**', NUCLEO, ...PUROS_DO_COMUM],
          // Migra o banco de teste e cria um banco por worker antes da suíte.
          globalSetup: ['./src/teste/bancos-por-worker.ts'],
        },
      },
      {
        test: {
          name: 'web',
          root: './apps/web',
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'quadro',
          root: './ferramentas/quadro',
          include: ['src/**/*.test.ts'],
        },
      },
    ],
    // A cobertura só mede (e só bloqueia) o núcleo (RNF01). Ela só é calculada com --coverage,
    // que o `npm run test:nucleo` passa.
    coverage: {
      provider: 'v8',
      // Relativo ao root do projeto (apps/api), não à raiz do repositório: com "apps/api/…" o
      // glob não pega nada e a cobertura passa medindo zero arquivos.
      include: ['src/modulos/*/nucleo/**/*.ts'],
      exclude: ['**/*.test.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, branches: 80 },
    },
  },
});
