import type { Status, TipoRecurso } from '@reservas/shared';

/** O que a RN23 precisa saber de uma Reserva: o Recurso dela, quando começa e o Status. */
export interface ReservaDoEquipamento {
  id: number;
  inicio: Date;
  status: Status;
  recurso: { id: number; tipo: TipoRecurso };
}

/**
 * RN23: a Reserva anterior do mesmo Equipamento ainda está Em uso, sem Devolução. A mesma regra
 * recusa o Check-in e, no fim da Tolerância, faz o `sincronizar` cancelar a Reserva sem Penalidade.
 */
export function equipamentoAindaFora(
  reserva: ReservaDoEquipamento,
  outras: readonly ReservaDoEquipamento[],
): boolean {
  return (
    reserva.recurso.tipo === 'Equipamento' &&
    outras.some(
      (anterior) =>
        anterior.id !== reserva.id &&
        anterior.recurso.id === reserva.recurso.id &&
        anterior.status === 'EmUso' &&
        anterior.inicio < reserva.inicio,
    )
  );
}
