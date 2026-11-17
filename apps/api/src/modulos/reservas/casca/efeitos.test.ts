import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from '../../../comum/banco';
import { bancoDeTeste, comBanco, esvaziar, umaReserva, umUsuario } from '../../../teste/banco';
import type { StatusMudouEmLote } from '../nucleo/reservar';
import { executar } from './efeitos';

let banco: Banco;

const AGORA = new Date('2026-11-10T09:00:00-03:00');

/** A Aprovação em lote do Carlos (Gestor), de Pendente para Confirmada. */
async function umaAprovacaoEmLote(reservaIds: number[]): Promise<StatusMudouEmLote> {
  const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
  return {
    evento: 'StatusMudouEmLote',
    reservaIds,
    transicao: { de: 'Pendente', para: 'Confirmada', em: AGORA, porId: carlos.id },
  };
}

comBanco('M3 · StatusMudouEmLote', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('RN21 · todas no Status de antes → muda o Status de cada uma, com uma transição em cada', async () => {
    const primeira = await umaReserva(banco, { status: 'Pendente' });
    const segunda = await umaReserva(banco, { status: 'Pendente' });
    const efeito = await umaAprovacaoEmLote([primeira.id, segunda.id]);

    const reservas = await banco.$transaction((tx) => executar(tx, efeito));

    expect(reservas.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: primeira.id, status: 'Confirmada' },
      { id: segunda.id, status: 'Confirmada' },
    ]);
    expect(
      await banco.transicao.count({
        where: { reservaId: { in: [primeira.id, segunda.id] }, de: 'Pendente', para: 'Confirmada' },
      }),
    ).toBe(2);
  });

  it('RN21 · uma das Reservas já saiu do Status de antes → lança e não grava nada (nem nas outras)', async () => {
    const pendente = await umaReserva(banco, { status: 'Pendente' });
    const cancelada = await umaReserva(banco, { status: 'Cancelada' });
    const efeito = await umaAprovacaoEmLote([pendente.id, cancelada.id]);

    await expect(banco.$transaction((tx) => executar(tx, efeito))).rejects.toThrow(
      'StatusMudouEmLote: 1 de 2 Reservas estavam Pendente.',
    );

    const depois = await banco.reserva.findMany({
      where: { id: { in: [pendente.id, cancelada.id] } },
      orderBy: { id: 'asc' },
      select: { status: true },
    });
    expect(depois).toEqual([{ status: 'Pendente' }, { status: 'Cancelada' }]);
    expect(await banco.transicao.count()).toBe(0);
  });
});
