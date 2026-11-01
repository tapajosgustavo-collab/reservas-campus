import secureSession from '@fastify/secure-session';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Perfil } from '../generated/prisma/client';
import { ErroApi } from './erros';

declare module '@fastify/secure-session' {
  interface SessionData {
    usuarioId: number;
    /** O `agora` do login, em ms: a sessão vence pelo `Relogio`, não pelo relógio do sistema. */
    entrouEm: number;
  }
}

/** O Usuário da sessão, que o núcleo recebe como `quem`. */
export interface Quem {
  id: number;
  perfil: Perfil;
}

/** O `quem` com nome e e-mail, para o `GET /api/sessao` não consultar o Usuário de novo. */
export interface UsuarioDaSessao extends Quem {
  nome: string;
  email: string;
}

export const NOME_DO_COOKIE = 'sessao';

// O sal não é segredo: só o segredo de sessão precisa ficar fora do repositório.
const SAL = 'reservas-campus!';

/** A sessão vale 8h (ADR 0002). */
const DURACAO_EM_SEGUNDOS = 8 * 60 * 60;

/**
 * Cookie da sessão (ADR 0002): `httpOnly`, `SameSite=Lax`, `Secure` em produção, com o `usuarioId`
 * e o `entrouEm`. A biblioteca também vence o cookie em 8h, mas pelo relógio do sistema; quem
 * vale para a regra é o `exigirSessao`, pelo `agora` da requisição (#33).
 */
export async function registrarSessao(app: FastifyInstance, segredo: string, producao: boolean) {
  await app.register(secureSession, {
    secret: segredo,
    salt: SAL,
    cookieName: NOME_DO_COOKIE,
    expiry: DURACAO_EM_SEGUNDOS,
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: producao,
      maxAge: DURACAO_EM_SEGUNDOS,
    },
  });
}

/** Grava o Usuário na sessão. Só a rota de login chama. */
export function iniciarSessao(request: FastifyRequest, usuarioId: number) {
  request.session.set('usuarioId', usuarioId);
  request.session.set('entrouEm', request.agora.getTime());
}

/**
 * Vence em 8h e também quando o login ficou no futuro: reiniciar a demo às 08:00 sem fechar o
 * navegador (#18) volta o relógio para antes do `entrouEm`, e essa sessão não vale mais.
 */
function venceu(entrouEm: number | undefined, agora: Date) {
  if (entrouEm === undefined) return true;
  const decorrido = agora.getTime() - entrouEm;
  return decorrido < 0 || decorrido >= DURACAO_EM_SEGUNDOS * 1000;
}

/** 401 sem sessão válida. O `quem` vem sempre da sessão, nunca do corpo (ADR 0002). */
export async function exigirSessao(request: FastifyRequest): Promise<Quem> {
  const { id, perfil } = await exigirUsuarioDaSessao(request);
  return { id, perfil };
}

/** Como o `exigirSessao`, com nome e e-mail na mesma consulta (para o `GET /api/sessao`). */
export async function exigirUsuarioDaSessao(request: FastifyRequest): Promise<UsuarioDaSessao> {
  const usuarioId = request.session.get('usuarioId');
  const usuario =
    usuarioId === undefined || venceu(request.session.get('entrouEm'), request.agora)
      ? null
      : await request.tx.usuario.findUnique({
          where: { id: usuarioId },
          select: { id: true, nome: true, email: true, perfil: true },
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
