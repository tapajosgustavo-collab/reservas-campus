import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { esquemaHealth } from '@reservas/shared';
import Fastify, { type RouteHandlerMethod } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Banco } from './comum/banco';
import { registrarRelogioDaDemo } from './comum/demo';
import { registrarErros } from './comum/erros';
import { RelogioFixo, type Relogio } from './comum/relogio';
import { registrarSessao } from './comum/sessao';
import { iniciarTique } from './comum/tique';
import { emTransacao } from './comum/transacao';

export interface OpcoesApp {
  /** A única porta (ADR 0001): `relogioDoSistema` em produção, `RelogioFixo` nos testes e na demo. */
  relogio: Relogio;
  /** Quem criou o banco é quem o fecha. */
  banco: Banco;
  /** Segredo do cookie de sessão, com pelo menos 32 bytes. */
  segredoSessao: string;
  /** SHA do commit em execução, devolvido no health para o deploy conferir a versão. */
  sha?: string;
  /** `DEMO=1`: expõe o relógio da demo, que então precisa ser um `RelogioFixo`. */
  demo?: boolean;
  /** Cookie de sessão só por HTTPS. */
  producao?: boolean;
  /** Intervalo do tique que roda o `sincronizar` sem ninguém acessar. Sem valor, sem tique. */
  tiqueMs?: number;
  /** Pasta do build da tela (`apps/web/dist`), servida na mesma origem pela imagem Docker. */
  tela?: string;
  logger?: boolean;
}

export async function construirApp({
  relogio,
  banco,
  segredoSessao,
  sha = 'local',
  demo = false,
  producao = false,
  tiqueMs,
  tela,
  logger = false,
}: OpcoesApp) {
  if (demo && !(relogio instanceof RelogioFixo)) {
    throw new Error('DEMO=1 precisa de um RelogioFixo.');
  }

  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registrarErros(app);
  await registrarSessao(app, segredoSessao, producao);

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

  if (tela) {
    await app.register(fastifyStatic, { root: tela, wildcard: false });
    // Endereço da tela aberto direto: o roteador do React resolve. O que é /api segue no 404.
    app.get('/*', { schema: { hide: true } }, (request, reply) =>
      /^\/api(\/|\?|$)/.test(request.url) ? reply.callNotFound() : reply.sendFile('index.html'),
    );
  }

  // Daqui para baixo, toda rota roda numa transação sob o advisory lock, depois do
  // `sincronizar(agora)` (ADR 0001, #12). Só a documentação, o health e a tela, acima, ficam de fora.
  // O handler tem que devolver a resposta (async), não chamar `reply.send`.
  app.addHook('onRoute', (rota) => {
    const handler = rota.handler as RouteHandlerMethod;
    rota.handler = function (request, reply) {
      return emTransacao(banco, relogio, request.log, (tx, agora) => {
        request.tx = tx;
        request.agora = agora;
        return handler.call(this, request, reply);
      });
    };
  });

  if (demo) registrarRelogioDaDemo(app, relogio as RelogioFixo);

  if (tiqueMs) {
    let parar = () => {};
    app.addHook('onReady', async () => {
      parar = iniciarTique(
        () => emTransacao(banco, relogio, app.log, async () => {}),
        tiqueMs,
        (erro) => app.log.error({ err: erro }, 'tique_falhou'),
      );
    });
    app.addHook('onClose', async () => parar());
  }

  return app;
}
