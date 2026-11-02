import type { Violacao } from './erros';

export interface Regra {
  nome: string;
}

/**
 * Catálogo das regras de negócio: id → nome, para a mensagem `RNxx · Nome: …`.
 * Cada RN entra aqui no ticket que a implementa.
 *
 * A US01 (e-mail fora de `@unifesp.br` ou não cadastrado) não tem RN e por isso não entra aqui:
 * volta `regra_violada` com `violacoes: []` e a mensagem `US01 · …` (ADR 0001).
 */
export const REGRAS = {
  RN13: { nome: 'Gestor do Recurso' },
} as const satisfies Record<`RN${number}`, Regra>;

export type IdRegra = keyof typeof REGRAS;

/** A violação de uma RN do catálogo, com o nome dela, como o núcleo devolve. */
export function violacao(rn: IdRegra, mensagem: string, campo?: string): Violacao {
  return { rn, nome: REGRAS[rn].nome, mensagem, ...(campo && { campo }) };
}
