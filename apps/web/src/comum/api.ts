import type { z } from 'zod';

// Cliente HTTP da tela: a API está na mesma origem (em dev, pelo proxy do Vite).
export async function buscarJson<T>(caminho: string, esquema: z.ZodType<T>): Promise<T> {
  const resposta = await fetch(caminho);
  if (!resposta.ok) {
    throw new Error(`${caminho} respondeu ${resposta.status}`);
  }
  return esquema.parse(await resposta.json());
}
