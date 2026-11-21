import { TZDate } from '@date-fns/tz';
import type { ItemDeReserva, Status, Transicao } from '@reservas/shared';
import { format } from 'date-fns';

const FUSO = 'America/Sao_Paulo';

export const ROTULO_DO_STATUS: Record<Status, string> = {
  Pendente: 'Pendente',
  Confirmada: 'Confirmada',
  Recusada: 'Recusada',
  Expirada: 'Expirada',
  Cancelada: 'Cancelada',
  EmUso: 'Em uso',
  Concluida: 'Concluída',
  NaoComparecimento: 'Não comparecimento',
};

const emSaoPaulo = (instante: string) => new TZDate(instante, FUSO);

export function rotuloDoIntervalo(inicio: string, fim: string) {
  const comeca = emSaoPaulo(inicio);
  const dia = format(comeca, 'dd/MM/yyyy');
  return `${dia}, das ${format(comeca, 'HH:mm')} às ${format(emSaoPaulo(fim), 'HH:mm')}`;
}

/** "11/11": o dia e o mês de São Paulo. */
export function rotuloDoDia(instante: string) {
  return format(emSaoPaulo(instante), 'dd/MM');
}

export function rotuloDoInstante(instante: string) {
  return format(emSaoPaulo(instante), "dd/MM/yyyy 'às' HH:mm");
}

export function rotuloDaTransicao({ de, para }: Pick<Transicao, 'de' | 'para'>) {
  if (de === null) return `Criada como ${ROTULO_DO_STATUS[para]}`;
  return `${ROTULO_DO_STATUS[de]} → ${ROTULO_DO_STATUS[para]}`;
}

/** Sempre há pelo menos uma página, mesmo vazia. */
export function paginasDe(total: number, porPagina: number) {
  return Math.max(1, Math.ceil(total / porPagina));
}

export type GrupoDeReserva =
  | { tipo: 'avulsa'; reserva: ItemDeReserva }
  | {
      tipo: 'serie';
      serieId: number;
      recurso: ItemDeReserva['recurso'];
      ocorrencias: ItemDeReserva[];
    };

/**
 * US10 e RN21: agrupa as Ocorrências de uma mesma Série na página na posição da primeira que
 * aparece, mantendo as Reservas avulsas onde estavam.
 */
export function agruparPorSerie(itens: readonly ItemDeReserva[]): GrupoDeReserva[] {
  const grupos: GrupoDeReserva[] = [];
  const porSerie = new Map<number, Extract<GrupoDeReserva, { tipo: 'serie' }>>();
  for (const item of itens) {
    if (item.serieId === null) {
      grupos.push({ tipo: 'avulsa', reserva: item });
      continue;
    }
    const existente = porSerie.get(item.serieId);
    if (existente) {
      existente.ocorrencias.push(item);
      continue;
    }
    const novo: Extract<GrupoDeReserva, { tipo: 'serie' }> = {
      tipo: 'serie',
      serieId: item.serieId,
      recurso: item.recurso,
      ocorrencias: [item],
    };
    grupos.push(novo);
    porSerie.set(item.serieId, novo);
  }
  return grupos;
}

/**
 * US10 e RN21: o rótulo do cabeçalho da Série na página, como
 * "Série · 3 Ocorrências nesta página (10/11, 17/11 e 24/11)".
 */
export function rotuloDaSerieNaPagina(
  ocorrencias: readonly Pick<ItemDeReserva, 'inicio'>[],
): string {
  const quantas =
    ocorrencias.length === 1
      ? '1 Ocorrência nesta página'
      : `${ocorrencias.length} Ocorrências nesta página`;
  const datas = ocorrencias.map(({ inicio }) => rotuloDoDia(inicio));
  const ultima = datas.pop();
  const lista = datas.length > 0 ? `${datas.join(', ')} e ${ultima}` : ultima;
  return `Série · ${quantas} (${lista})`;
}
