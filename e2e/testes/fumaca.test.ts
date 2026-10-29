import { expect, test } from '@playwright/test';
import { conferirSemRolagemHorizontal } from './ajudantes';

// O CI constrói a imagem com o GIT_SHA do commit; sem ele, a API responde "local".
const sha = process.env.GIT_SHA || 'local';

test('a tela abre e mostra a versão em execução', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Reservas do Campus' })).toBeVisible();
  await expect(page.getByText(`versão ${sha.slice(0, 7)}`)).toBeVisible();
  await conferirSemRolagemHorizontal(page);
});
