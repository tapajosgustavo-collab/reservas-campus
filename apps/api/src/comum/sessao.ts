import secureSession from '@fastify/secure-session';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Perfil } from '../generated/prisma/client';
import { ErroApi } from './erros';

declare module '@fastify/secure-session' {
  interface SessionData {
    usuarioId: number;
  }
}

/** O Usuário da sessão, que o núcleo recebe como `quem`. */
export interface Quem {
  id: number;
  perfil: Perfil;
}

export const NOME_DO_COOKIE = 'sessao';

// O sal não é segredo: só o segredo de sessão precisa ficar fora do repositório.
const SAL = 'reservas-campus!';

/** Cookie da sessão (ADR 0002): `httpOnly`, `SameSite=Lax`, `Secure` em produção, só o `usuarioId`. */
export async function registrarSessao(app: FastifyInstance, segredo: string, producao: boolean) {
  await app.register(secureSession, {
    secret: segredo,
    salt: SAL,
    cookieName: NOME_DO_COOKIE,
    cookie: { path: '/', httpOnly: true, sameSite: 'lax', secure: producao },
  });
}

/** 401 sem sessão válida. O `quem` vem sempre da sessão, nunca do corpo (ADR 0002). */
export async function exigirSessao(request: FastifyRequest): Promise<Quem> {
  const usuarioId = request.session.get('usuarioId');
  const usuario =
    usuarioId === undefined
      ? null
      : await request.tx.usuario.findUnique({
          where: { id: usuarioId },
          select: { id: true, perfil: true },
        });
  if (!usuario) throw new ErroApi('nao_autenticado', 'Entre no sistema para continuar.');
  return usuario;
}

/** 401 sem sessão; 403 se o Perfil do Usuário não é um dos da rota. */
export async function exigirPerfil(request: FastifyRequest, ...perfis: Perfil[]): Promise<Quem> {
  const quem = await exigirSessao(request);
  if (!perfis.includes(quem.perfil)) {
    throw new ErroApi('proibido', `Só ${perfis.join(' ou ')} pode fazer isto.`);
  }
  return quem;
}
