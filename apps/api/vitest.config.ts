import { defineConfig } from 'vitest/config';

// O .env da raiz é opcional; no CI as variáveis vêm do ambiente.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // sem .env
}

export default defineConfig({
  test: {
    globalSetup: ['./src/teste/migrar.ts'],
    // Os testes com banco esvaziam o mesmo banco: um arquivo por vez até o #26 dar um banco por worker.
    fileParallelism: false,
  },
});
