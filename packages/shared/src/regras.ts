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
export const REGRAS = {} as const satisfies Record<`RN${number}`, Regra>;

export type IdRegra = keyof typeof REGRAS;
