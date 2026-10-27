import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { esquemaHealth } from '@reservas/shared';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

export interface OpcoesApp {
  /** SHA do commit em execução, devolvido no health para o deploy conferir a versão. */
  sha: string;
  logger?: boolean;
}

export async function construirApp({ sha, logger = false }: OpcoesApp) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // O OpenAPI sai dos schemas Zod das rotas (RNF06).
  await app.register(swagger, {
    openapi: {
      info: { title: 'Reservas do Campus', version: sha },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  app.get('/api/openapi.json', { schema: { hide: true } }, () => app.swagger());

  app.get(
    '/api/health',
    {
      schema: {
        summary: 'Confere se a API está no ar e qual versão está rodando',
        tags: ['infra'],
        response: { 200: esquemaHealth },
      },
    },
    () => ({ status: 'ok' as const, sha }),
  );

  return app;
}
