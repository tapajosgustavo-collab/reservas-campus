import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * RNF07: a página não rola na horizontal. Só a grade da agenda e a tabela da fila do Gestor
 * podem rolar, cada uma dentro do seu quadro, e isso não conta como rolagem da página.
 */
export async function conferirSemRolagemHorizontal(page: Page) {
  const { conteudo, janela } = await page.evaluate(() => ({
    conteudo: document.documentElement.scrollWidth,
    janela: document.documentElement.clientWidth,
  }));
  expect(
    conteudo,
    `a página rola na horizontal: o conteúdo tem ${conteudo}px numa janela de ${janela}px`,
  ).toBeLessThanOrEqual(janela);
}

/**
 * RNF13: o axe (regras WCAG 2.1 A e AA) não acha nenhuma violação "serious" ou "critical".
 */
export async function conferirAcessibilidade(page: Page) {
  const resultados = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

  const graves = resultados.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );

  expect(
    graves,
    `Violações de acessibilidade encontradas:\n${JSON.stringify(graves, null, 2)}`,
  ).toEqual([]);
}

const MINUTO = 60_000;
const MEIA_HORA = 30 * MINUTO;
// Os valores da Política (docs/requisitos.md, §6) que o fluxo de Check-in usa.
const ANTECEDENCIA_MINIMA_MIN = 60;
const CHECK_IN_ANTES_DO_INICIO_MIN = 15;

/**
 * RN05: o primeiro Intervalo de 30 minutos que a Antecedência mínima aceita a partir do `agora`.
 * São Paulo fica a um número inteiro de horas do UTC, então a meia hora do UTC é a de lá.
 */
export function proximoIntervaloReservavel(agora: string): { inicio: Date; fim: Date } {
  const minimo = Date.parse(agora) + ANTECEDENCIA_MINIMA_MIN * MINUTO;
  const inicio = Math.ceil(minimo / MEIA_HORA) * MEIA_HORA;
  return { inicio: new Date(inicio), fim: new Date(inicio + MEIA_HORA) };
}

/** RN14: o instante em que a janela do Check-in abre. */
export function janelaDoCheckIn(inicio: Date): Date {
  return new Date(inicio.getTime() - CHECK_IN_ANTES_DO_INICIO_MIN * MINUTO);
}

const PARTES_EM_SAO_PAULO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * RNF08: o instante em São Paulo, como a tela mostra: `campo` é o valor do "Ir para data e hora"
 * da barra do relógio, e `data` e `hora` montam o rótulo de Minhas reservas.
 */
export function emSaoPaulo(instante: Date): { campo: string; data: string; hora: string } {
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    PARTES_EM_SAO_PAULO.formatToParts(instante).find((p) => p.type === tipo)?.value ?? '';
  const [ano, mes, dia] = [parte('year'), parte('month'), parte('day')];
  const hora = `${parte('hour')}:${parte('minute')}`;
  return { campo: `${ano}-${mes}-${dia}T${hora}`, data: `${dia}/${mes}/${ano}`, hora };
}
