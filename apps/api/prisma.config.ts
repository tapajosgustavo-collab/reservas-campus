import { defineConfig } from 'prisma/config';

// O Prisma 7 não lê o .env sozinho. O da raiz é opcional: no CI e no contêiner as variáveis
// vêm do ambiente.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // sem .env
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/seed/principal.ts',
  },
  // Opcional aqui para o `prisma generate` rodar sem banco (npm install, lint).
  datasource: { url: process.env.DATABASE_URL },
});
