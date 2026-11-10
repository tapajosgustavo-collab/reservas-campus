import { TZDate } from '@date-fns/tz';
import type { Horario, IndisponibilidadeNaAgenda, Ocupacao } from '@reservas/shared';
import { addDays, addWeeks, format, parseISO } from 'date-fns';

const FUSO = 'America/Sao_Paulo';
const MEIA_HORA = 30;

/** Um dia da semana em que o Recurso abre, com a faixa do Horário de funcionamento. */
export interface DiaDaGrade extends Horario {
  /** `YYYY-MM-DD`. */
  data: string;
}

/** O Intervalo que a pessoa escolheu na grade, em minutos desde 0h do dia em São Paulo. */
export interface IntervaloEscolhido {
  data: string;
  inicio: number;
  fim: number;
}

export type EstadoDaCelula =
  | 'livre'
  | 'ocupado'
  | 'minha-confirmada'
  | 'minha-pendente'
  | 'indisponivel'
  | 'fechado'
  | 'passado';

/** Segunda `YYYY-MM-DD` mais (ou menos) `semanas` semanas. Só calendário, sem fuso. */
export function semanaVizinha(semana: string, semanas: number): string {
  return format(addWeeks(parseISO(semana), semanas), 'yyyy-MM-dd');
}

/** Os dias da semana que começa na `semana` (segunda) em que o Recurso abre, de segunda a domingo. */
export function diasDaGrade(semana: string, horarios: Horario[]): DiaDaGrade[] {
  const segunda = parseISO(semana);
  return [0, 1, 2, 3, 4, 5, 6].flatMap((deslocamento) => {
    const dia = addDays(segunda, deslocamento);
    const faixa = horarios.find(({ diaSemana }) => diaSemana === dia.getDay());
    return faixa ? [{ ...faixa, data: format(dia, 'yyyy-MM-dd') }] : [];
  });
}

/** Linhas da grade: de meia em meia hora, da primeira abertura ao último fechamento da semana. */
export function linhasDaGrade(dias: DiaDaGrade[]): number[] {
  if (dias.length === 0) return [];
  const primeira = Math.min(...dias.map(({ abre }) => abre));
  const ultima = Math.max(...dias.map(({ fecha }) => fecha));
  const linhas = [];
  for (let minuto = primeira; minuto < ultima; minuto += MEIA_HORA) linhas.push(minuto);
  return linhas;
}

/** O instante de `minuto` do dia `data` em São Paulo (1440 = 0h do dia seguinte). */
function instanteDe(data: string, minuto: number): number {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new TZDate(ano!, mes! - 1, dia!, 0, minuto, FUSO).getTime();
}

/** A meia hora que começa em `minuto` toca alguma Indisponibilidade (RN04)? */
function indisponivelNa(
  dia: DiaDaGrade,
  minuto: number,
  indisponibilidades: IndisponibilidadeNaAgenda[],
) {
  const inicio = instanteDe(dia.data, minuto);
  const fim = instanteDe(dia.data, minuto + MEIA_HORA);
  return indisponibilidades.some(
    (i) => Date.parse(i.inicio) < fim && (i.fim === null || Date.parse(i.fim) > inicio),
  );
}

/** A Ocupação que toca a meia hora que começa em `minuto`, se houver. */
export function ocupacaoNa(dia: DiaDaGrade, minuto: number, ocupacoes: Ocupacao[]) {
  const inicio = instanteDe(dia.data, minuto);
  const fim = instanteDe(dia.data, minuto + MEIA_HORA);
  return ocupacoes.find((o) => Date.parse(o.inicio) < fim && Date.parse(o.fim) > inicio);
}

/**
 * O que a célula de meia hora mostra. A Reserva (inclusive a Em uso dentro de uma Indisponibilidade,
 * RN04) e a Indisponibilidade aparecem mesmo no passado; o resto do que já começou é Passado, pelo
 * `agora` da API. Sem pré-bloqueio por Política: quem explica é a RN.
 */
export function estadoDaCelula(
  dia: DiaDaGrade,
  minuto: number,
  ocupacoes: Ocupacao[],
  agora: Date,
  indisponibilidades: IndisponibilidadeNaAgenda[] = [],
): EstadoDaCelula {
  if (minuto < dia.abre || minuto + MEIA_HORA > dia.fecha) return 'fechado';
  const ocupacao = ocupacaoNa(dia, minuto, ocupacoes);
  if (ocupacao?.minha)
    return ocupacao.status === 'Pendente' ? 'minha-pendente' : 'minha-confirmada';
  if (ocupacao) return 'ocupado';
  if (indisponivelNa(dia, minuto, indisponibilidades)) return 'indisponivel';
  return instanteDe(dia.data, minuto) < agora.getTime() ? 'passado' : 'livre';
}

/** Clique num horário livre: 1h, ou 30 min se a meia hora seguinte não estiver livre. */
export function intervaloDoClique(
  dia: DiaDaGrade,
  minuto: number,
  ocupacoes: Ocupacao[],
  agora: Date,
  indisponibilidades: IndisponibilidadeNaAgenda[] = [],
): IntervaloEscolhido {
  const seguinte = estadoDaCelula(dia, minuto + MEIA_HORA, ocupacoes, agora, indisponibilidades);
  const seguinteLivre = seguinte === 'livre';
  return { data: dia.data, inicio: minuto, fim: minuto + (seguinteLivre ? 2 : 1) * MEIA_HORA };
}

/**
 * Arrastar de uma célula a outra do mesmo dia: o Intervalo vai de `de` na direção de `ate`, em
 * qualquer direção, e para na última célula antes de uma bloqueada, sem atravessá-la.
 */
export function intervaloDoArraste(
  dia: DiaDaGrade,
  de: number,
  ate: number,
  indisponibilidades: IndisponibilidadeNaAgenda[] = [],
): IntervaloEscolhido {
  // Bloqueada é a célula Indisponível (RN04). As ocupadas por Reserva entram aqui no #95.
  const bloqueada = (minuto: number) => indisponivelNa(dia, minuto, indisponibilidades);
  const passo = ate >= de ? MEIA_HORA : -MEIA_HORA;
  let ultima = de;
  while (ultima !== ate && !bloqueada(ultima + passo)) ultima += passo;
  return { data: dia.data, inicio: Math.min(de, ultima), fim: Math.max(de, ultima) + MEIA_HORA };
}
