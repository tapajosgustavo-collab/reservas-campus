import { expect, test } from '@playwright/test';
import { conferirSemRolagemHorizontal } from './ajudantes';

// Confere o próprio helper, sem a app: páginas montadas na hora.
test.describe('RNF07 · Página sem rolagem horizontal', () => {
  test('recusa a página mais larga que a janela', async ({ page }) => {
    await page.setContent('<div style="width: 2000px">largo</div>');

    await expect(conferirSemRolagemHorizontal(page)).rejects.toThrow('a página rola na horizontal');
  });

  test('aceita o que rola dentro do seu quadro, como a grade da agenda', async ({ page }) => {
    await page.setContent(
      '<div style="overflow-x: auto"><div style="width: 2000px">grade</div></div>',
    );

    await conferirSemRolagemHorizontal(page);
  });
});
