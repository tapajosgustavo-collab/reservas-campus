import { esquemaEntrar, esquemaSessao, esquemaUsuariosDemo } from '@reservas/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErroApi } from '../../../comum/erros';
import { paraIsoSaoPaulo } from '../../../comum/instante';
import { exigirSessao, iniciarSessao } from '../../../comum/sessao';
import { decidirEntrada, normalizarEmail } from '../nucleo/entrar';

const COLUNAS_DO_USUARIO = { id: true, nome: true, email: true, perfil: true } as const;

/** `GET /api/usuarios-demo` e `POST`, `GET` e `DELETE /api/sessao` (US01, ADR 0002). */
export function registrarSessaoDoUsuario(app: FastifyInstance, demo: boolean) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.get(
    '/api/usuarios-demo',
    {
      schema: {
        summary: 'Lista os Usuários de demonstração para o "Entrar como…"',
        tags: ['conduta'],
        response: { 200: esquemaUsuariosDemo },
      },
    },
    // Todo Usuário do banco é de demonstração (ADR 0002). O Perfil ordena na ordem do enum.
    (request) =>
      request.tx.usuario.findMany({
        select: { nome: true, email: true, perfil: true },
        orderBy: [{ perfil: 'asc' }, { nome: 'asc' }],
      }),
  );

  rotas.post(
    '/api/sessao',
    {
      schema: {
        summary: 'Entra com o e-mail institucional, sem senha',
        tags: ['conduta'],
        body: esquemaEntrar,
        response: { 200: esquemaSessao },
      },
    },
    async (request) => {
      const email = normalizarEmail(request.body.email);
      const usuario = await request.tx.usuario.findUnique({
        where: { email },
        select: COLUNAS_DO_USUARIO,
      });
      const decisao = decidirEntrada(email, usuario);
      if (decisao.tipo === 'recusada') throw new ErroApi('regra_violada', decisao.mensagem);
      iniciarSessao(request, decisao.usuarioId);
      return { usuario: usuario!, agora: paraIsoSaoPaulo(request.agora), demo };
    },
  );

  rotas.get(
    '/api/sessao',
    {
      schema: {
        summary: 'Mostra quem está na sessão e o agora da API',
        tags: ['conduta'],
        response: { 200: esquemaSessao },
      },
    },
    async (request) => {
      const { id } = await exigirSessao(request);
      const usuario = await request.tx.usuario.findUniqueOrThrow({
        where: { id },
        select: COLUNAS_DO_USUARIO,
      });
      return { usuario, agora: paraIsoSaoPaulo(request.agora), demo };
    },
  );

  rotas.delete(
    '/api/sessao',
    {
      schema: {
        summary: 'Sai do sistema',
        tags: ['conduta'],
        response: { 204: z.null().describe('Sessão encerrada') },
      },
    },
    // Sem exigir sessão: sair com ela já vencida ainda precisa apagar o cookie.
    async (request, reply) => {
      request.session.delete();
      reply.status(204);
      return null;
    },
  );
}
