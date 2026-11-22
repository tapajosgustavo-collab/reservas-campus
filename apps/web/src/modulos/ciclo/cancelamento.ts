import { TZDate } from '@date-fns/tz';
import {
  esquemaCancelamento,
  esquemaCancelamentoDaSerie,
  POLITICA,
  type Reserva,
} from '@reservas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { enviarJson } from '../../comum/api';

const FUSO = 'America/Sao_Paulo';
const emSaoPaulo = (instante: string) => new TZDate(instante, FUSO);

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
 * RN16: cancelar agora seria Cancelamento tardio? Só a Confirmada, com menos de 2h até o início,
 * pelo `agora` da API. Quem decide e grava a Penalidade é a API: aqui é só para avisar antes.
 */
export function cancelarGeraPenalidade({ status, inicio }: ReservaDoBotao, agora: string) {
  const antecedencia = Date.parse(inicio) - Date.parse(agora);
  return status === 'Confirmada' && antecedencia < POLITICA.cancelamentoSemPenalidadeMin * 60_000;
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

/** RNF08: a data (`YYYY-MM-DD`) da Ocorrência no calendário de São Paulo. */
export function dataDaOcorrencia({ inicio }: Pick<Reserva, 'inicio'>): string {
  return format(emSaoPaulo(inicio), 'yyyy-MM-dd');
}

/**
 * RN16 e RN21: as Ocorrências da Série que ainda podem ser canceladas (Pendente ou Confirmada antes
 * do início, pelo `agora` da API), da primeira à última.
 */
export function ocorrenciasCancelaveisDaSerie<T extends ReservaDoBotao>(
  ocorrencias: readonly T[],
  agora: string,
): T[] {
  return ocorrencias
    .filter((ocorrencia) => podeCancelar(ocorrencia, agora))
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
}

/**
 * RN16 e RN21: cancelar a Série a partir de `aPartirDe` gera Penalidade em alguma Ocorrência?
 * Só se alguma Ocorrência cancelável com data `>= aPartirDe` estiver Confirmada a menos de 2h do início.
 */
export function cancelarSerieGeraPenalidade(
  ocorrencias: readonly ReservaDoBotao[],
  aPartirDe: string,
  agora: string,
): boolean {
  return ocorrenciasCancelaveisDaSerie(ocorrencias, agora)
    .filter((ocorrencia) => dataDaOcorrencia(ocorrencia) >= aPartirDe)
    .some((ocorrencia) => cancelarGeraPenalidade(ocorrencia, agora));
}

export function useCancelarSerie() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ({ serieId, aPartirDe }: { serieId: number; aPartirDe: string }) =>
      enviarJson(
        'POST',
        `/api/series/${serieId}/cancelamento`,
        { aPartirDe },
        esquemaCancelamentoDaSerie,
      ),
    onSettled: () => cliente.invalidateQueries(),
  });
}
