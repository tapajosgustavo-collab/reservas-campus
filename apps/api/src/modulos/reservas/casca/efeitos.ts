import type { Transacao } from '../../../comum/banco';
import type { Efeito } from '../nucleo/reservar';

/** Grava um efeito do M3 (só ele grava em `reserva` e `transicao`) e devolve a Reserva. */
export function executar(tx: Transacao, efeito: Efeito) {
  switch (efeito.evento) {
    case 'ReservaCriada':
      return tx.reserva.create({
        data: { ...efeito.reserva, transicoes: { create: efeito.transicao } },
      });
  }
}
