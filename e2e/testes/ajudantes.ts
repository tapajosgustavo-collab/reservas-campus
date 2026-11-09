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
