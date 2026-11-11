import { TZDate } from '@date-fns/tz';
import {
  POLITICA,
  type CriarReserva,
  type CriarSerie,
  type Reserva,
  type Violacao,
} from '@reservas/shared';
import { format, formatISO, parseISO, startOfWeek } from 'date-fns';
import { janelaDoCheckIn } from '../ciclo';

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

/** US09: a Série repete o Intervalo da primeira Ocorrência até `ate`, sem as datas desmarcadas. */
export function corpoDaSerie(
  recursoId: number,
  formulario: FormularioDaReserva,
  ate: string,
  datasExcluidas: string[],
): CriarSerie {
  return { ...corpoDaReserva(recursoId, formulario), ate, datasExcluidas };
}

/** `2026-11-17` → `17/11`. */
export function diaEMes(data: string) {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

/** Na Série, cada violação de uma Ocorrência vem com a data dela (RN21). */
export function linhaDaViolacaoNaSerie(violacao: Violacao, linha: string) {
  return violacao.data ? `${diaEMes(violacao.data)} · ${linha}` : linha;
}

export function tituloDasViolacoes(quantas: number) {
  const regras = quantas === 1 ? '1 regra impede' : `${quantas} regras impedem`;
  return `Não foi possível reservar. ${regras} esta Reserva:`;
}

const emSaoPaulo = (instante: string) => new TZDate(instante, FUSO);
const hora = (ms: number) => format(new TZDate(ms, FUSO), 'HH:mm');

/**
 * RN10: o aviso da janela em Recurso restrito, com quem aprova e o Prazo de decisão do Intervalo
 * escolhido. Quem expira o Pedido é a API; a tela só avisa.
 */
export function avisoDoPedido(
  gestor: string,
  { data, inicio }: Pick<FormularioDaReserva, 'data' | 'inicio'>,
) {
  const horas = POLITICA.prazoDeDecisaoMin / 60;
  const prazo = instanteDe(data, inicio).getTime() - POLITICA.prazoDeDecisaoMin * 60_000;
  // Com a Data apagada no formulário não há instante: o aviso fica sem a data, a janela não quebra.
  const ate = Number.isNaN(prazo)
    ? `${horas}h antes do início`
    : `${format(new TZDate(prazo, FUSO), "dd/MM 'às' HH:mm")}, ${horas}h antes do início`;
  return (
    `Recurso restrito: o Pedido fica Pendente até ${gestor} aprovar, o que precisa acontecer ` +
    `até ${ate}. Sem decisão até lá, ele expira.`
  );
}

/**
 * O que a agenda diz depois de criar: o Intervalo e o próximo passo, que na Reserva Confirmada é
 * a janela de Check-in (RN14) e no Pedido é esperar a Aprovação (RN10).
 */
export function resumoDaCriada({
  inicio,
  fim,
  status,
}: Pick<Reserva, 'inicio' | 'fim' | 'status'>) {
  const dia = format(emSaoPaulo(inicio), 'dd/MM');
  const intervalo = `das ${hora(Date.parse(inicio))} às ${hora(Date.parse(fim))}`;
  if (status === 'Pendente') {
    return `Pedido enviado para ${dia}, ${intervalo}. Ele fica Pendente até a Aprovação do Gestor.`;
  }
  const { abre, fecha } = janelaDoCheckIn(inicio);
  return (
    `Reserva criada para ${dia}, ${intervalo}. ` +
    `Faça o Check-in das ${hora(abre)} às ${hora(fecha)}.`
  );
}

/** O que a agenda diz depois de criar a Série: quantas Ocorrências, de quando a quando. */
export function resumoDaSerie(reservas: Pick<Reserva, 'inicio' | 'fim' | 'status'>[]) {
  const primeira = reservas[0]!;
  const ultima = reservas.at(-1)!;
  const intervalo = `das ${hora(Date.parse(primeira.inicio))} às ${hora(Date.parse(primeira.fim))}`;
  const quantas = reservas.length === 1 ? '1 Ocorrência' : `${reservas.length} Ocorrências`;
  const periodo = `de ${format(emSaoPaulo(primeira.inicio), 'dd/MM')} a ${format(emSaoPaulo(ultima.inicio), 'dd/MM')}`;
  const estado =
    primeira.status === 'Pendente'
      ? 'Elas ficam Pendentes até o Gestor decidir a Série.'
      : 'Faça o Check-in de cada uma na hora.';
  return `Série criada: ${quantas} ${periodo}, ${intervalo}. ${estado}`;
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
