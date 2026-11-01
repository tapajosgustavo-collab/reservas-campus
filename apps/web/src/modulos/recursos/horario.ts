import type { Horario } from '@reservas/shared';

export const DIAS_DA_SEMANA = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;

/** Uma linha do formulário: um dia da semana, aberto ou fechado. */
export interface LinhaDoHorario {
  diaSemana: number;
  aberto: boolean;
  abre: number;
  fecha: number;
}

/** Faixa sugerida ao abrir um dia que estava fechado. */
const FAIXA_PADRAO = { abre: 7 * 60, fecha: 23 * 60 };

/** O que o cadastro sugere: segunda a sexta, das 7h às 23h. */
export const HORARIO_INICIAL: Horario[] = [1, 2, 3, 4, 5].map((diaSemana) => ({
  diaSemana,
  ...FAIXA_PADRAO,
}));

/** 450 → "07:30"; 1440 → "24:00" (meia-noite, fim do dia). */
export function rotuloDoMinuto(minutos: number): string {
  const horas = String(Math.floor(minutos / 60)).padStart(2, '0');
  return `${horas}:${String(minutos % 60).padStart(2, '0')}`;
}

/** As opções de meia em meia hora, de `de` até `ate`, para as listas de abre e fecha. */
export function opcoesDeMeiaHora(de: number, ate: number) {
  const opcoes = [];
  for (let minutos = de; minutos <= ate; minutos += 30) {
    opcoes.push({ value: String(minutos), label: rotuloDoMinuto(minutos) });
  }
  return opcoes;
}

export function linhasDoHorario(horarios: Horario[]): LinhaDoHorario[] {
  return DIAS_DA_SEMANA.map((_, diaSemana) => {
    const faixa = horarios.find((horario) => horario.diaSemana === diaSemana);
    return { diaSemana, aberto: faixa !== undefined, ...(faixa ?? FAIXA_PADRAO) };
  });
}

export function horariosDasLinhas(linhas: LinhaDoHorario[]): Horario[] {
  return linhas
    .filter((linha) => linha.aberto)
    .map(({ diaSemana, abre, fecha }) => ({ diaSemana, abre, fecha }));
}
