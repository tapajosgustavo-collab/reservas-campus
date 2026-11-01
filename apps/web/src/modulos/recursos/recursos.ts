import {
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
