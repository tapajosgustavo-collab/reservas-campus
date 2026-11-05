// Ponto de entrada do `npm run db:resetar -w @reservas/api`.
import { criarBanco } from '../comum/banco';
import { relogioDoAmbiente } from '../comum/relogio';
import { resetar } from './resetar';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Defina DATABASE_URL (veja o .env.example).');

const banco = criarBanco(url);
try {
  // Em produção, sem DEMO=1, o T0 das cenas é a hora do reset (#18).
  await resetar(banco, relogioDoAmbiente(process.env).agora());
  console.log('Banco de demonstração resetado e semeado com sucesso.');
} finally {
  await banco.$disconnect();
}
