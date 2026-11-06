import { TZDate } from '@date-fns/tz';
import { POLITICA, type CriarReserva, type Reserva } from '@reservas/shared';
import { addMinutes, format, formatISO, parseISO, startOfWeek } from 'date-fns';

const FUSO = 'America/Sao_Paulo';
const MEIA_HORA = 30;

/** O que a pessoa preencheu na janela. */
export interface FormularioDaReserva {
  /** `YYYY-MM-DD`. */
  data: string;
  /** Minutos desde 0h em São Paulo. */
  inicio: number;
  fim: number;
  participantes?: number;
  finalidade?: string;
}

/** O instante de `minuto` do dia `data` em São Paulo (1440 = 0h do dia seguinte). */
function instanteDe(data: string, minuto: number) {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new TZDate(ano!, mes! - 1, dia!, 0, minuto, FUSO);
}

export function corpoDaReserva(
  recursoId: number,
  { data, inicio, fim, participantes, finalidade }: FormularioDaReserva,
): CriarReserva {
  const texto = finalidade?.trim();
  return {
    recursoId,
    inicio: formatISO(instanteDe(data, inicio)),
    fim: formatISO(instanteDe(data, fim)),
    ...(participantes !== undefined && { participantes }),
    ...(texto && { finalidade: texto }),
  };
}

export function tituloDasViolacoes(quantas: number) {
  const regras = quantas === 1 ? '1 regra impede' : `${quantas} regras impedem`;
  return `Não foi possível reservar. ${regras} esta Reserva:`;
}

const emSaoPaulo = (instante: string) => new TZDate(instante, FUSO);

/** O que a agenda diz depois de criar: o Intervalo e a janela de Check-in (RN14). */
export function resumoDaCriada({ inicio, fim }: Pick<Reserva, 'inicio' | 'fim'>) {
  const comeca = emSaoPaulo(inicio);
  const abreCheckIn = addMinutes(comeca, -POLITICA.checkInAntesDoInicioMin);
  const fechaCheckIn = addMinutes(comeca, POLITICA.toleranciaMin);
  const hora = (instante: Date) => format(instante, 'HH:mm');
  return (
    `Reserva criada para ${format(comeca, 'dd/MM')}, das ${hora(comeca)} às ${hora(emSaoPaulo(fim))}. ` +
    `Faça o Check-in das ${hora(abreCheckIn)} às ${hora(fechaCheckIn)}.`
  );
}

/** A célula de meia hora que começa em `minuto` do dia `data` está dentro da Reserva? */
export function reservaCobre(
  { inicio, fim }: Pick<Reserva, 'inicio' | 'fim'>,
  data: string,
  minuto: number,
) {
  const celula = instanteDe(data, minuto).getTime();
  return Date.parse(inicio) < celula + MEIA_HORA * 60_000 && celula < Date.parse(fim);
}

/** A segunda-feira da semana de `data`. Só calendário, sem fuso. */
export function semanaDe(data: string) {
  return format(startOfWeek(parseISO(data), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}
