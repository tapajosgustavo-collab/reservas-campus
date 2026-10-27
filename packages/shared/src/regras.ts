export interface Regra {
  nome: string;
}

/**
 * Catálogo das regras de negócio: id → nome, para a mensagem `RNxx · Nome: …`.
 * Cada RN entra aqui no ticket que a implementa.
 */
export const REGRAS = {} as const satisfies Record<`RN${number}`, Regra>;

export type IdRegra = keyof typeof REGRAS;
