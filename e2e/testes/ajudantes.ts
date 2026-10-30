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
