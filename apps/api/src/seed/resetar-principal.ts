// Ponto de entrada do `npm run db:resetar -w @reservas/api`.
import { criarBanco } from '../comum/banco';
import { resetar } from './resetar';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Defina DATABASE_URL (veja o .env.example).');

const banco = criarBanco(url);
try {
  await resetar(banco);
  console.log('Banco de demonstração resetado e semeado com sucesso.');
} finally {
  await banco.$disconnect();
}
