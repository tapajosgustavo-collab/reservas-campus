import { esquemaCancelamento, type Reserva } from '@reservas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enviarJson } from '../../comum/api';

type ReservaDoBotao = Pick<Reserva, 'status' | 'inicio'>;

/**
 * RN16: o botão de cancelar só aparece em Reserva Pendente ou Confirmada, antes do início, pelo
 * `agora` da API (nunca pelo relógio do navegador). Quem decide é a API: aqui é só para não
 * oferecer o que ela vai recusar.
 */
export function podeCancelar({ status, inicio }: ReservaDoBotao, agora: string) {
  if (status !== 'Pendente' && status !== 'Confirmada') return false;
  return Date.parse(agora) < Date.parse(inicio);
}

/**
 * Quanto falta, pelo `agora` da API, para o início chegar e o botão sumir. Passado esse tempo, a
 * tela consulta o `agora` de novo: o navegador só marca a hora de perguntar. `null` quando não há
 * mais nada a esperar.
 */
export function msAteInicio(reserva: ReservaDoBotao, agora: string) {
  if (!podeCancelar(reserva, agora)) return null;
  return Date.parse(reserva.inicio) - Date.parse(agora);
}

export function useCancelarReserva() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (reservaId: number) =>
      enviarJson('POST', `/api/reservas/${reservaId}/cancelamento`, undefined, esquemaCancelamento),
    // Aceito, a Reserva vai para Encerradas em Minhas reservas, muda no detalhe e libera a agenda.
    // Recusado, o `agora` da sessão estava velho (o início chegou com a tela aberta).
    onSettled: () => cliente.invalidateQueries(),
  });
}
