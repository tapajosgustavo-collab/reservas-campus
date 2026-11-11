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
  RN01: { nome: 'Sem Conflito' },
  RN02: { nome: 'Intervalo válido' },
  RN03: { nome: 'Dentro do Horário de funcionamento' },
  RN04: { nome: 'Indisponibilidade' },
  RN05: { nome: 'Antecedência' },
  RN06: { nome: 'Duração máxima' },
  RN07: { nome: 'Cota' },
  RN08: { nome: 'Capacidade' },
  RN10: { nome: 'Restrito começa Pendente' },
  RN11: { nome: 'Recusa justificada' },
  RN12: { nome: 'Expiração' },
  RN13: { nome: 'Gestor do Recurso' },
  RN14: { nome: 'Janela de Check-in' },
  RN16: { nome: 'Cancelamento' },
  RN17: { nome: 'Devolução atrasada' },
  RN21: { nome: 'Série tudo-ou-nada' },
  RN22: { nome: 'Agenda sem nomes' },
} as const satisfies Record<`RN${number}`, Regra>;

export type IdRegra = keyof typeof REGRAS;

/**
 * A violação de uma RN do catálogo, com o nome dela, como o núcleo devolve. `data` só na Série: a
 * Ocorrência que viola a regra.
 */
export function violacao(rn: IdRegra, mensagem: string, campo?: string, data?: string): Violacao {
  return { rn, nome: REGRAS[rn].nome, mensagem, ...(campo && { campo }), ...(data && { data }) };
}
