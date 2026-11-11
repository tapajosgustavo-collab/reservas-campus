import { esquemaFila, esquemaReserva, type ItemDaFila } from '@reservas/shared';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { ErroDaApi, buscarJson, enviarJson } from '../../comum/api';

const HORA_MS = 60 * 60 * 1000;

/**
 * US11: a cor do "Expira em" pelo `agora` da API (nunca pelo relógio do navegador): amarelo a menos
 * de 24h do Prazo de decisão, vermelho a menos de 2h ou já passado.
 */
export function corDoPrazo(expiraEm: string, agora: string): 'red' | 'yellow' | null {
  const falta = Date.parse(expiraEm) - Date.parse(agora);
  if (falta < 2 * HORA_MS) return 'red';
  if (falta < 24 * HORA_MS) return 'yellow';
  return null;
}

/**
 * Quanto falta, pelo `agora` da API, para algum "Expira em" mudar de cor (24h e 2h antes do
 * prazo). Passado esse tempo, a tela consulta o `agora` de novo. `null` quando não há o que esperar.
 */
export function msAteMudarACor(expiracoes: string[], agora: string): number | null {
  const instante = Date.parse(agora);
  const faltas = expiracoes
    .flatMap((expiraEm) => [24 * HORA_MS, 2 * HORA_MS].map((antes) => Date.parse(expiraEm) - antes))
    .map((muda) => muda - instante)
    .filter((falta) => falta > 0);
  return faltas.length > 0 ? Math.min(...faltas) : null;
}

/** RN11: a Recusa só é enviada com a justificativa escrita; quem decide é a API. */
export function podeConfirmarRecusa(justificativa: string): boolean {
  return Boolean(justificativa.trim());
}

/** "25/30" no Espaço (participantes sobre a Capacidade); "—" no Equipamento. */
export function rotuloDasPessoas({
  participantes,
  recurso,
}: {
  participantes: number | null;
  recurso: { capacidade: number | null };
}): string {
  if (recurso.capacidade === null) return '—';
  return `${participantes ?? '—'}/${recurso.capacidade}`;
}

/** RN12: a API recusou porque o Pedido expirou antes de chegar a vez dele no lote. */
function expirou(erro: Error): boolean {
  return erro instanceof ErroDaApi && erro.violacoes.some(({ rn }) => rn === 'RN12');
}

/**
 * US11: o resumo da Aprovação em lote, um resultado por Pedido (`null` = aprovado), como
 * "3 aprovados, 1 já tinha expirado".
 */
export function resumoDoLote(resultados: (Error | null)[]): string {
  const erros = resultados.filter((resultado) => resultado !== null);
  const aprovados = resultados.length - erros.length;
  const expirados = erros.filter(expirou).length;
  const outros = erros.length - expirados;

  const partes = [`${aprovados} ${aprovados === 1 ? 'aprovado' : 'aprovados'}`];
  if (expirados > 0) {
    partes.push(`${expirados} ${expirados === 1 ? 'já tinha expirado' : 'já tinham expirado'}`);
  }
  if (outros > 0) {
    partes.push(
      `${outros} ${outros === 1 ? 'não pôde ser aprovado' : 'não puderam ser aprovados'}`,
    );
  }
  return partes.join(', ');
}

/** US11: os Pedidos Pendentes dos Recursos do Gestor da sessão, do mais urgente. */
export function useFila() {
  return useQuery({
    queryKey: ['fila'],
    queryFn: () => buscarJson('/api/gestao/pedidos', esquemaFila),
  });
}

function aprovar(id: number) {
  return enviarJson('POST', `/api/reservas/${id}/aprovacao`, undefined, esquemaReserva);
}

/**
 * US11: Aprovação de um ou de vários Pedidos, uma requisição por item, em sequência (spec §5: sem
 * rota de lote). Devolve um resultado por Pedido, na ordem, sem parar no primeiro erro.
 */
export function useAprovarPedidos() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (pedidos: ItemDaFila[]) => {
      const resultados: (Error | null)[] = [];
      for (const { id } of pedidos) {
        try {
          await aprovar(id);
          resultados.push(null);
        } catch (erro) {
          resultados.push(erro instanceof Error ? erro : new Error(String(erro)));
        }
      }
      return resultados;
    },
    onSettled: () => cliente.invalidateQueries(),
  });
}

export function useRecusarPedido() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ({ id, justificativa }: { id: number; justificativa: string }) =>
      enviarJson('POST', `/api/reservas/${id}/recusa`, { justificativa }, esquemaReserva),
    onSettled: () => cliente.invalidateQueries(),
  });
}
