import { POLITICA } from '@reservas/shared';
import type { Transacao } from '../../../comum/banco';
import type { Notificacao } from '../../../generated/prisma/client';
import { registrarPenalidade, type PenalidadeGerada } from '../../conduta';
import { notificacaoDeInicioDaSuspensao, type NotificacaoEmitida } from '../nucleo/notificacao';

/**
 * Grava um efeito do M4 (só ele grava em `notificacao`). Os outros módulos que emitem uma
 * Notificação (o Cancelamento pelo sistema na Indisponibilidade, no M2) gravam por aqui.
 */
export function executar(tx: Transacao, efeito: NotificacaoEmitida): Promise<Notificacao> {
  return tx.notificacao.create({ data: efeito.notificacao });
}

/**
 * Pede ao M1 que registre a Penalidade e, se ela iniciou uma Suspensão (RN19), avisa o Usuário.
 * Todo lugar do M4 que gera Penalidade (o `sincronizar` e o Cancelamento tardio) passa por aqui.
 */
export async function registrarPenalidadeEAvisar(tx: Transacao, efeito: PenalidadeGerada) {
  const registrada = await registrarPenalidade(tx, efeito);
  if (registrada.suspensao) {
    await executar(tx, notificacaoDeInicioDaSuspensao(registrada.suspensao, POLITICA));
  }
  return registrada;
}
