import {
  esquemaAgenda,
  esquemaRecurso,
  esquemaRecursos,
  type CadastrarRecurso,
  type EditarRecurso,
} from '@reservas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buscarJson, enviarJson } from '../../comum/api';

const CHAVE = 'recursos';

/** "Meus recursos": os Recursos do Gestor da sessão. */
export function useMeusRecursos() {
  return useQuery({
    queryKey: [CHAVE, 'meus'],
    queryFn: () => buscarJson('/api/recursos?gestor=eu', esquemaRecursos),
  });
}

export function useRecurso(id: number) {
  return useQuery({
    queryKey: [CHAVE, id],
    queryFn: () => buscarJson(`/api/recursos/${id}`, esquemaRecurso),
  });
}

/** A agenda da semana que começa na `semana` (segunda); sem ela, a semana do agora da API. */
export function useAgenda(id: number, semana: string | null) {
  return useQuery({
    queryKey: [CHAVE, id, 'agenda', semana],
    queryFn: () =>
      buscarJson(
        `/api/recursos/${id}/agenda${semana ? `?semana=${encodeURIComponent(semana)}` : ''}`,
        esquemaAgenda,
      ),
    // Ao trocar de semana, a grade anterior fica na tela até a nova chegar; de outro Recurso, não.
    placeholderData: (anterior) => (anterior?.recurso.id === id ? anterior : undefined),
  });
}

/** Busca de novo as agendas do Recurso, depois de criar uma Reserva nele. */
export function useRecarregarAgenda(id: number) {
  const cliente = useQueryClient();
  return () => cliente.invalidateQueries({ queryKey: [CHAVE, id, 'agenda'] });
}

export function useCadastrarRecurso() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (recurso: CadastrarRecurso) =>
      enviarJson('POST', '/api/recursos', recurso, esquemaRecurso),
    onSuccess: () => cliente.invalidateQueries({ queryKey: [CHAVE] }),
  });
}

export function useEditarRecurso(id: number) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (edicao: EditarRecurso) =>
      enviarJson('PATCH', `/api/recursos/${id}`, edicao, esquemaRecurso),
    onSuccess: () => cliente.invalidateQueries({ queryKey: [CHAVE] }),
  });
}
