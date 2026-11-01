import { esquemaErro, type CodigoErro } from '@reservas/shared';
import type { z } from 'zod';

/** Erro da API com a mensagem em português do envelope, pronta para mostrar na tela. */
export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: CodigoErro | undefined,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroDaApi';
  }
}

async function paraErro(caminho: string, resposta: Response): Promise<ErroDaApi> {
  const envelope = esquemaErro.safeParse(await resposta.json().catch(() => null));
  return envelope.success
    ? new ErroDaApi(resposta.status, envelope.data.erro.codigo, envelope.data.erro.mensagem)
    : new ErroDaApi(resposta.status, undefined, `${caminho} respondeu ${resposta.status}`);
}

// Cliente HTTP da tela: a API está na mesma origem (em dev, pelo proxy do Vite).
export async function buscarJson<T>(caminho: string, esquema: z.ZodType<T>): Promise<T> {
  const resposta = await fetch(caminho);
  if (!resposta.ok) throw await paraErro(caminho, resposta);
  return esquema.parse(await resposta.json());
}

/** `POST` ou `DELETE` com corpo JSON. Sem `esquema`, a resposta é ignorada (204). */
export async function enviarJson<T = void>(
  metodo: 'POST' | 'DELETE',
  caminho: string,
  corpo?: unknown,
  esquema?: z.ZodType<T>,
): Promise<T> {
  const resposta = await fetch(caminho, {
    method: metodo,
    headers: corpo === undefined ? undefined : { 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (!resposta.ok) throw await paraErro(caminho, resposta);
  return (esquema ? esquema.parse(await resposta.json()) : undefined) as T;
}
