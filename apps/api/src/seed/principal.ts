// Ponto de entrada do `npm run db:semear -w @reservas/api` (prisma db seed).
import { criarBanco } from '../comum/banco';
import { relogioDoAmbiente } from '../comum/relogio';
import { semear } from './semear';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Defina DATABASE_URL (veja o .env.example).');

const banco = criarBanco(url);
try {
  // O mesmo relógio do servidor: na demo, o T0 das cenas é o RELOGIO_FIXO com que a API sobe.
  const resultado = await semear(banco, relogioDoAmbiente(process.env).agora());
  console.log(
    resultado === 'semeado'
      ? 'Seed aplicado.'
      : 'O banco já tem dados: seed ignorado (ele só roda com o banco vazio).',
  );
} finally {
  await banco.$disconnect();
}
