import {
  esquemaDetalheDaReserva,
  esquemaPaginaDeReservas,
  esquemaReserva,
  esquemaSerieCriada,
  type CriarReserva,
  type CriarSerie,
  type Situacao,
} from '@reservas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buscarJson, enviarJson } from '../../comum/api';

const CHAVE = 'reservas';

export function useCriarReserva() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (reserva: CriarReserva) =>
      enviarJson('POST', '/api/reservas', reserva, esquemaReserva),
    onSuccess: () => cliente.invalidateQueries({ queryKey: [CHAVE] }),
  });
}

/** US09: a Série cria todas as Ocorrências de uma vez, ou nenhuma (RN21). */
export function useCriarSerie() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (serie: CriarSerie) => enviarJson('POST', '/api/series', serie, esquemaSerieCriada),
    onSuccess: () => cliente.invalidateQueries({ queryKey: [CHAVE] }),
  });
}

/** "Minhas reservas": uma página da aba escolhida. */
export function useMinhasReservas(situacao: Situacao, pagina: number) {
  return useQuery({
    queryKey: [CHAVE, situacao, pagina],
    queryFn: () =>
      buscarJson(`/api/reservas?situacao=${situacao}&pagina=${pagina}`, esquemaPaginaDeReservas),
  });
}

export function useReserva(id: number) {
  return useQuery({
    queryKey: [CHAVE, id],
    queryFn: () => buscarJson(`/api/reservas/${id}`, esquemaDetalheDaReserva),
    // A RN22 não muda se tentar de novo.
    retry: false,
  });
}
