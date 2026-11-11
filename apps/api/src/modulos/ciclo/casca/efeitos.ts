import type { Transacao } from '../../../comum/banco';
import type { Notificacao } from '../../../generated/prisma/client';
import type { NotificacaoEmitida } from '../nucleo/pedido';

/**
 * Grava um efeito do M4 (só ele grava em `notificacao`). Os outros módulos que emitem uma
 * Notificação (o Cancelamento pelo sistema na Indisponibilidade, no M2) gravam por aqui.
 */
export function executar(tx: Transacao, efeito: NotificacaoEmitida): Promise<Notificacao> {
  return tx.notificacao.create({ data: efeito.notificacao });
}
