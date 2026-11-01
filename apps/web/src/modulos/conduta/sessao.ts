import { esquemaSessao, esquemaUsuariosDemo, type Sessao } from '@reservas/shared';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buscarJson, enviarJson, ErroDaApi } from '../../comum/api';

const CHAVE = ['sessao'];

/** Quem está na sessão; `null` sem sessão ou com ela vencida (401). */
export function useSessao() {
  return useQuery({
    queryKey: CHAVE,
    queryFn: async (): Promise<Sessao | null> => {
      try {
        return await buscarJson('/api/sessao', esquemaSessao);
      } catch (erro) {
        if (erro instanceof ErroDaApi && erro.status === 401) return null;
        throw erro;
      }
    },
    retry: false,
  });
}

export function useUsuariosDemo() {
  return useQuery({
    queryKey: ['usuarios-demo'],
    queryFn: () => buscarJson('/api/usuarios-demo', esquemaUsuariosDemo),
  });
}

/**
 * Troca quem está na sessão. Os dados da pessoa anterior não podem ficar na tela: as outras
 * consultas voltam ao início (`resetQueries`, que mantém os observadores, ao contrário do
 * `removeQueries`).
 */
function trocarSessao(cliente: QueryClient, sessao: Sessao | null) {
  cliente.setQueryData(CHAVE, sessao);
  void cliente.resetQueries({ predicate: ({ queryKey }) => queryKey[0] !== CHAVE[0] });
}

export function useEntrar() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => enviarJson('POST', '/api/sessao', { email }, esquemaSessao),
    onSuccess: (sessao) => trocarSessao(cliente, sessao),
  });
}

export function useSair() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () => enviarJson('DELETE', '/api/sessao'),
    // Só depois que a API apagou o cookie: se a saída falhar, a sessão continua na tela e o erro
    // aparece, senão o próximo que recarregasse a página entraria como esta pessoa.
    onSuccess: () => trocarSessao(cliente, null),
  });
}

/**
 * Um 401 em qualquer consulta ou ação quer dizer que a sessão venceu no meio do uso (8h, ou um
 * salto no relógio da demo): a sessão é consultada de novo e a tela volta sozinha para o "Entrar".
 */
export function voltarAoEntrarNo401(cliente: QueryClient, erro: unknown) {
  if (erro instanceof ErroDaApi && erro.status === 401) {
    void cliente.invalidateQueries({ queryKey: CHAVE });
  }
}
