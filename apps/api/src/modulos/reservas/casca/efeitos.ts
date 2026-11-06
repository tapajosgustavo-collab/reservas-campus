import type { Transacao } from '../../../comum/banco';
import type { Efeito } from '../nucleo/reservar';

/**
 * Grava um efeito do M3 (só ele grava em `reserva` e `transicao`) e devolve a Reserva. Os outros
 * módulos que decidem uma mudança de Status (como o M4) gravam por aqui.
 */
export function executar(tx: Transacao, efeito: Efeito) {
  switch (efeito.evento) {
    case 'ReservaCriada':
      return tx.reserva.create({
        data: { ...efeito.reserva, transicoes: { create: efeito.transicao } },
      });
    case 'StatusMudou':
      return tx.reserva.update({
        where: { id: efeito.reservaId },
        data: { status: efeito.transicao.para, transicoes: { create: efeito.transicao } },
      });
  }
}
