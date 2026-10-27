import type { Transacao } from '../../../comum/banco';

/**
 * Aplica tudo o que o tempo fez vencer até `agora` (#12) e devolve quantos efeitos gravou.
 * Roda no começo de toda requisição e no tique, sempre dentro da transação e sob o advisory lock.
 * Ainda não há vencimentos: os primeiros (RN12 e lembrete) chegam no incremento 3.
 */
export const sincronizar: (tx: Transacao, agora: Date) => Promise<number> = async () => 0;
