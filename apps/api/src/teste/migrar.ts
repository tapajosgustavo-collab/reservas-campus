import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Antes da suíte: aplica as migrações no banco de teste, se houver um. */
export default function migrar() {
  const url = process.env.DATABASE_URL_TESTE;
  if (!url) return;
  execSync('npx prisma migrate deploy', {
    // Na pasta da API, onde está o prisma.config.ts, de onde quer que o Vitest tenha sido chamado.
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
