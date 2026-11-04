import { violacao, type Violacao } from '@reservas/shared';
import type { Quem } from './reservar';

/** O que a regra precisa saber da Reserva aberta. */
export interface ReservaAberta {
  usuarioId: number;
  /** O Gestor responsável pelo Recurso da Reserva. */
  gestorId: number;
}

/** RN22: só o dono e o Gestor responsável abrem o detalhe da Reserva. */
export function violacoesDoDetalhe({ usuarioId, gestorId }: ReservaAberta, quem: Quem): Violacao[] {
  if (quem.id === usuarioId || quem.id === gestorId) return [];
  return [violacao('RN22', 'Só quem fez a Reserva e o Gestor do Recurso podem abri-la.')];
}
