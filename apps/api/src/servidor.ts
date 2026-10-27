import { z } from 'zod';
import { construirApp } from './app';

const ambiente = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('localhost'),
    GIT_SHA: z.string().optional(),
    RENDER_GIT_COMMIT: z.string().optional(),
  })
  .parse(process.env);

const app = await construirApp({
  sha: ambiente.GIT_SHA || ambiente.RENDER_GIT_COMMIT || 'local',
  logger: true,
});

await app.listen({ port: ambiente.PORT, host: ambiente.HOST });
