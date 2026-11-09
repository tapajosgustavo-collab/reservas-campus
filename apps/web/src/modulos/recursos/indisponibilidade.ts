import { TZDate } from '@date-fns/tz';
import type { CriarIndisponibilidade, IndisponibilidadeNaAgenda } from '@reservas/shared';
import { format, formatISO } from 'date-fns';

const FUSO = 'America/Sao_Paulo';

/** O que o Gestor preencheu: datas `YYYY-MM-DD` e minutos desde 0h em São Paulo. */
export interface FormularioDaIndisponibilidade {
  dataInicio: string;
  inicio: number;
  dataFim: string;
  fim: number;
  /** Sem previsão de volta: tirar o Recurso de uso. */
  semFim: boolean;
  motivo: string;
}

function instanteDe(data: string, minuto: number) {
  const [ano, mes, dia] = data.split('-').map(Number);
  return formatISO(new TZDate(ano!, mes! - 1, dia!, 0, minuto, FUSO));
}

export function corpoDaIndisponibilidade(
  formulario: FormularioDaIndisponibilidade,
): CriarIndisponibilidade {
  return {
    inicio: instanteDe(formulario.dataInicio, formulario.inicio),
    fim: formulario.semFim ? null : instanteDe(formulario.dataFim, formulario.fim),
    motivo: formulario.motivo.trim(),
  };
}

/** O que a tela diz depois de cadastrar: quantas Reservas foram canceladas (US05). */
export function resumoDaIndisponibilidade(reservasCanceladas: number) {
  const inicio = 'Indisponibilidade cadastrada.';
  if (reservasCanceladas === 0) return `${inicio} Nenhuma Reserva precisou ser cancelada.`;
  const quantas =
    reservasCanceladas === 1 ? '1 Reserva recebeu' : `${reservasCanceladas} Reservas receberam`;
  return `${inicio} ${quantas} Cancelamento pelo sistema, sem Penalidade.`;
}

const diaEHora = (instante: string) => format(new TZDate(instante, FUSO), 'dd/MM HH:mm');

/** RN04: a linha da agenda com o período e o motivo, que é público. */
export function periodoDaIndisponibilidade({ inicio, fim, motivo }: IndisponibilidadeNaAgenda) {
  const periodo = fim
    ? `de ${diaEHora(inicio)} a ${diaEHora(fim)}`
    : `a partir de ${diaEHora(inicio)}, sem previsão de volta`;
  return `Indisponível ${periodo}: ${motivo}`;
}
