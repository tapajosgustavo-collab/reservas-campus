/** 450 → "07:30"; 1440 → "24:00" (meia-noite, fim do dia). */
export function rotuloDoMinuto(minutos: number): string {
  const horas = String(Math.floor(minutos / 60)).padStart(2, '0');
  return `${horas}:${String(minutos % 60).padStart(2, '0')}`;
}

/** As opções de meia em meia hora, de `de` até `ate`, para as listas de horário. */
export function opcoesDeMeiaHora(de: number, ate: number) {
  const opcoes = [];
  for (let minutos = de; minutos <= ate; minutos += 30) {
    opcoes.push({ value: String(minutos), label: rotuloDoMinuto(minutos) });
  }
  return opcoes;
}
