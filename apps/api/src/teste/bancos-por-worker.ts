import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { criarBanco } from '../comum/banco';
import { comOutroBanco, nomeDoBanco, urlDoWorker } from './url-do-banco';

/**
 * Antes da suíte `api`: aplica as migrações no `DATABASE_URL_TESTE` e faz dele o modelo de um
 * banco por worker (`reservas_teste_1`…), recriados do zero a cada execução. Assim os arquivos de
 * teste rodam em paralelo, cada worker esvaziando só o seu banco.
 */
export default async function bancosPorWorker(projeto: TestProject) {
  const base = process.env.DATABASE_URL_TESTE;
  if (!base) {
    // No CI o banco é obrigatório: sem ele o job `api` ficaria verde sem testar nada.
    if (process.env.CI) recusar('Defina DATABASE_URL_TESTE: no CI a suíte api precisa do banco.');
    return;
  }
  if (base === process.env.DATABASE_URL) {
    recusar('DATABASE_URL_TESTE é o banco do dia a dia: os testes apagariam tudo nele.');
  }

  execSync('npx prisma migrate deploy', {
    // Na pasta da API, onde está o prisma.config.ts, de onde quer que o Vitest tenha sido chamado.
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: base },
    stdio: 'inherit',
  });

  // O CREATE DATABASE roda conectado a outro banco: o modelo não pode ter conexões abertas.
  const servidor = criarBanco(comOutroBanco(base, 'postgres'));
  try {
    const modelo = nomeDoBanco(base);
    for (let worker = 1; worker <= projeto.globalConfig.maxWorkers; worker++) {
      const nome = nomeDoBanco(urlDoWorker(base, worker));
      await servidor.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${nome}" WITH (FORCE)`);
      await servidor.$executeRawUnsafe(`CREATE DATABASE "${nome}" TEMPLATE "${modelo}"`);
    }
  } finally {
    await servidor.$disconnect();
  }
}

// O Vitest 5 quebra ao formatar a pilha de um erro do globalSetup ("code.charCodeAt is not a
// function") e a mensagem some; por isso ela vai para o console antes.
function recusar(mensagem: string): never {
  console.error(`\n${mensagem}\n`);
  throw new Error(mensagem);
}
