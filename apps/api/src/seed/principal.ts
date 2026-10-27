// Ponto de entrada do `npm run db:semear -w @reservas/api` (prisma db seed).
import { criarBanco } from '../comum/banco';
import { semear } from './semear';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Defina DATABASE_URL (veja o .env.example).');

const banco = criarBanco(url);
try {
  const resultado = await semear(banco);
  console.log(
    resultado === 'semeado'
      ? 'Seed aplicado.'
      : 'O banco já tem dados: seed ignorado (ele só roda com o banco vazio).',
  );
} finally {
  await banco.$disconnect();
}
