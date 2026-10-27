import { esquemaMudarRelogio, esquemaRelogio } from '@reservas/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { paraIsoSaoPaulo } from './instante';
import type { RelogioFixo } from './relogio';
import { exigirSessao } from './sessao';

/** `GET`/`POST /api/demo/relogio` (RNF02): só existe com `DEMO=1`. */
export function registrarRelogioDaDemo(app: FastifyInstance, relogio: RelogioFixo) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();
  const resposta = () => ({ agora: paraIsoSaoPaulo(relogio.agora()) });

  rotas.get(
    '/api/demo/relogio',
    {
      schema: {
        summary: 'Mostra o instante do relógio da demo',
        tags: ['demo'],
        response: { 200: esquemaRelogio },
      },
    },
    async (request) => {
      await exigirSessao(request);
      return resposta();
    },
  );

  rotas.post(
    '/api/demo/relogio',
    {
      schema: {
        summary: 'Avança o relógio da demo ou leva a um instante exato',
        tags: ['demo'],
        body: esquemaMudarRelogio,
        response: { 200: esquemaRelogio },
      },
    },
    async (request) => {
      await exigirSessao(request);
      const corpo = request.body;
      if ('ir' in corpo) relogio.ir(new Date(corpo.ir));
      else relogio.avancar(corpo.avancarMinutos);
      return resposta();
    },
  );
}
