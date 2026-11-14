import type { Transacao } from '../../../comum/banco';
import type { Reserva, Serie } from '../../../generated/prisma/client';
import type { Efeito, ReservasCanceladasPeloSistema, StatusMudouEmLote } from '../nucleo/reservar';
import type { SerieCriada } from '../nucleo/serie';

/**
 * Grava um efeito do M3 (só ele grava em `serie`, `reserva` e `transicao`) e devolve a Reserva, as
 * Reservas do lote, a Série com as Ocorrências, ou quantas foram canceladas pelo sistema. Os outros
 * módulos que decidem uma mudança de Status (o Check-in e a Série decidida do M4, a
 * Indisponibilidade do M2) gravam por aqui.
 */
export function executar(tx: Transacao, efeito: ReservasCanceladasPeloSistema): Promise<number>;
export function executar(tx: Transacao, efeito: StatusMudouEmLote): Promise<Reserva[]>;
export function executar(
  tx: Transacao,
  efeito: SerieCriada,
): Promise<Serie & { reservas: Reserva[] }>;
export function executar(tx: Transacao, efeito: Efeito): Promise<Reserva>;
export async function executar(
  tx: Transacao,
  efeito: Efeito | ReservasCanceladasPeloSistema | StatusMudouEmLote | SerieCriada,
): Promise<Reserva | Reserva[] | number | (Serie & { reservas: Reserva[] })> {
  switch (efeito.evento) {
    case 'StatusMudouEmLote': {
      // Três idas ao banco para o lote inteiro, e não duas por Reserva.
      const where = { id: { in: efeito.reservaIds } };
      await tx.reserva.updateMany({ where, data: { status: efeito.transicao.para } });
      await tx.transicao.createMany({
        data: efeito.reservaIds.map((reservaId) => ({ reservaId, ...efeito.transicao })),
      });
      return tx.reserva.findMany({ where, orderBy: [{ inicio: 'asc' }, { id: 'asc' }] });
    }
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
    case 'SerieCriada':
      return tx.serie.create({
        data: {
          ...efeito.serie,
          reservas: {
            create: efeito.ocorrencias.map(({ reserva, transicao }) => ({
              ...reserva,
              transicoes: { create: transicao },
            })),
          },
        },
        include: { reservas: { orderBy: { inicio: 'asc' } } },
      });
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
