import { TZDate } from '@date-fns/tz';
import type { Status, Transicao } from '@reservas/shared';
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
