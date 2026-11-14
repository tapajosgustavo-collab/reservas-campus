import type { Transacao } from '../../../comum/banco';
import type { Penalidade } from '../../../generated/prisma/client';
import type { PenalidadeGerada } from '../nucleo/penalidade';

/**
 * Grava um efeito do M1 (só ele grava em `penalidade`). Os outros módulos que geram uma
 * Penalidade (o Não comparecimento do `sincronizar`, no M4) gravam por aqui.
 */
export function executar(tx: Transacao, efeito: PenalidadeGerada): Promise<Penalidade> {
  return tx.penalidade.create({ data: efeito.penalidade });
}
