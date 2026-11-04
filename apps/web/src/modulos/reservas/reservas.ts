import { esquemaReserva, type CriarReserva } from '@reservas/shared';
import { useMutation } from '@tanstack/react-query';
import { enviarJson } from '../../comum/api';

export function useCriarReserva() {
  return useMutation({
    mutationFn: (reserva: CriarReserva) =>
      enviarJson('POST', '/api/reservas', reserva, esquemaReserva),
  });
}
