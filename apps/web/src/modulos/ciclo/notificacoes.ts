import { esquemaPaginaDeNotificacoes, type Notificacao } from '@reservas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { buscarJson, enviarJson } from '../../comum/api';

export const INTERVALO_DE_POLLING_MS = 30_000;

export interface AlvoDeEventos {
  addEventListener(tipo: string, ouvinte: () => void): void;
  removeEventListener(tipo: string, ouvinte: () => void): void;
}

export interface AmbienteDePolling {
  documento: AlvoDeEventos & { readonly visibilityState: string };
  janela: AlvoDeEventos;
  agendarIntervalo?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  cancelarIntervalo?: (id: ReturnType<typeof setInterval>) => void;
}

/**
 * US16: polling de 30 s só com a aba visível, pausando o `setInterval` quando
 * `document.visibilityState === 'hidden'` e buscando imediatamente (reiniciando o ciclo de 30 s)
 * ao voltar a visibilidade ou o foco da janela.
 */
export function iniciarPollingVisivel(
  buscar: () => void,
  ambiente: AmbienteDePolling = { documento: document, janela: window },
): () => void {
  const {
    documento,
    janela,
    agendarIntervalo = (fn, ms) => setInterval(fn, ms),
    cancelarIntervalo = (id) => clearInterval(id),
  } = ambiente;

  let timer: ReturnType<typeof setInterval> | null = null;

  function pararTimer() {
    if (timer !== null) {
      cancelarIntervalo(timer);
      timer = null;
    }
  }

  function iniciarTimerSeVisivel() {
    pararTimer();
    if (documento.visibilityState !== 'hidden') {
      timer = agendarIntervalo(() => {
        if (documento.visibilityState !== 'hidden') buscar();
        else pararTimer();
      }, INTERVALO_DE_POLLING_MS);
    }
  }

  function aoMudarVisibilidade() {
    if (documento.visibilityState === 'hidden') {
      pararTimer();
    } else {
      buscar();
      iniciarTimerSeVisivel();
    }
  }

  function aoFocar() {
    if (documento.visibilityState !== 'hidden') {
      buscar();
      iniciarTimerSeVisivel();
    }
  }

  iniciarTimerSeVisivel();
  documento.addEventListener('visibilitychange', aoMudarVisibilidade);
  janela.addEventListener('focus', aoFocar);

  return () => {
    pararTimer();
    documento.removeEventListener('visibilitychange', aoMudarVisibilidade);
    janela.removeEventListener('focus', aoFocar);
  };
}

/**
 * US16: detecta se chegaram novas Notificações não lidas depois da primeira carga da sessão,
 * devolvendo o conjunto atualizado de ids já vistos e o texto do aviso (ou `null`).
 */
export function avisoDeNovasNotificacoes(
  vistas: ReadonlySet<number> | null,
  itens: readonly Pick<Notificacao, 'id' | 'mensagem' | 'lidaEm'>[],
): { vistas: Set<number>; aviso: string | null } {
  const proximo = new Set(vistas ?? []);
  const novas: string[] = [];

  for (const item of itens) {
    if (vistas !== null && item.lidaEm === null && !vistas.has(item.id)) {
      novas.push(item.mensagem);
    }
    proximo.add(item.id);
  }

  return {
    vistas: proximo,
    aviso: novas.length > 0 ? novas.join(' ') : null,
  };
}

export function rotuloDoSino(naoLidas: number): string {
  if (naoLidas <= 0) return 'Notificações';
  return naoLidas === 1 ? 'Notificações (1 não lida)' : `Notificações (${naoLidas} não lidas)`;
}

export function useNotificacoes(pagina = 1, opcoes: { polling?: boolean; enabled?: boolean } = {}) {
  const { polling = true, enabled = true } = opcoes;
  const consulta = useQuery({
    queryKey: ['notificacoes', pagina],
    queryFn: () => buscarJson(`/api/notificacoes?pagina=${pagina}`, esquemaPaginaDeNotificacoes),
    refetchOnWindowFocus: false,
    enabled,
  });
  const { refetch } = consulta;

  useEffect(() => {
    if (!polling || !enabled) return;
    return iniciarPollingVisivel(() => void refetch());
  }, [polling, enabled, refetch]);

  return consulta;
}

export function useMarcarNotificacaoLida() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => enviarJson('POST', `/api/notificacoes/${id}/leitura`),
    onSettled: () => cliente.invalidateQueries({ queryKey: ['notificacoes'] }),
  });
}

export function useMarcarTodasNotificacoesLidas() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () => enviarJson('POST', '/api/notificacoes/leitura'),
    onSettled: () => cliente.invalidateQueries({ queryKey: ['notificacoes'] }),
  });
}
