import type { Transacao } from '../../../comum/banco';
import type { Reserva } from '../../../generated/prisma/client';
import type { Efeito, ReservasCanceladasPeloSistema } from '../nucleo/reservar';

/**
 * Grava um efeito do M3 (só ele grava em `reserva` e `transicao`) e devolve a Reserva, ou quantas
 * foram canceladas pelo sistema. Os outros módulos que decidem uma mudança de Status (o Check-in do
 * M4, a Indisponibilidade do M2) gravam por aqui.
 */
export function executar(tx: Transacao, efeito: ReservasCanceladasPeloSistema): Promise<number>;
export function executar(tx: Transacao, efeito: Efeito): Promise<Reserva>;
export async function executar(
  tx: Transacao,
  efeito: Efeito | ReservasCanceladasPeloSistema,
): Promise<Reserva | number> {
  switch (efeito.evento) {
    case 'ReservasCanceladasPeloSistema': {
      // Duas idas ao banco para todas as Reservas, e não duas por Reserva.
      const { count } = await tx.reserva.updateMany({
        where: { id: { in: efeito.reservas.map(({ id }) => id) } },
        data: { status: 'Cancelada' },
      });
      await tx.transicao.createMany({
        data: efeito.reservas.map(({ id, de }) => ({
          reservaId: id,
          de,
          para: 'Cancelada' as const,
          em: efeito.em,
          porId: null,
          observacao: efeito.observacao,
        })),
      });
      return count;
    }
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
