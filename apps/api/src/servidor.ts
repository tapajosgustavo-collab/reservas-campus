import { z } from 'zod';
import { construirApp } from './app';
import { criarBanco } from './comum/banco';
import { relogioDoSistema, RelogioFixo } from './comum/relogio';

const ambiente = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('localhost'),
    NODE_ENV: z.string().optional(),
    GIT_SHA: z.string().optional(),
    RENDER_GIT_COMMIT: z.string().optional(),
    DATABASE_URL: z.string().min(1, 'Defina DATABASE_URL (veja o .env.example).'),
    SEGREDO_SESSAO: z
      .string()
      .refine((s) => Buffer.byteLength(s) >= 32, 'SEGREDO_SESSAO precisa de pelo menos 32 bytes.'),
    DEMO: z.string().optional(),
    // Vazio no .env conta como ausente.
    RELOGIO_FIXO: z.preprocess(
      (valor) => valor || undefined,
      z.iso.datetime({ offset: true }).optional(),
    ),
  })
  .parse(process.env);

const demo = ambiente.DEMO === '1';
const banco = criarBanco(ambiente.DATABASE_URL);

const app = await construirApp({
  // Na demo o relógio começa parado no RELOGIO_FIXO (ou agora, se faltar) e só anda pela rota.
  relogio: demo
    ? new RelogioFixo(ambiente.RELOGIO_FIXO ? new Date(ambiente.RELOGIO_FIXO) : new Date())
    : relogioDoSistema,
  banco,
  segredoSessao: ambiente.SEGREDO_SESSAO,
  sha: ambiente.GIT_SHA || ambiente.RENDER_GIT_COMMIT || 'local',
  demo,
  producao: ambiente.NODE_ENV === 'production',
  tiqueMs: 60_000,
  logger: true,
});

app.addHook('onClose', () => banco.$disconnect());

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sinal, () => void app.close());
}

await app.listen({ port: ambiente.PORT, host: ambiente.HOST });
