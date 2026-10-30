import { defineConfig } from '@playwright/test';

// Roda contra a imagem Docker já no ar (`docker compose up`), a mesma do deploy, com DEMO=1.
export default defineConfig({
  testDir: './testes',
  forbidOnly: !!process.env.CI,
  retries: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.URL_DA_APP || 'http://localhost:3000',
    // Gravado na nova tentativa de um teste que falhou; o CI guarda como artefato.
    trace: 'on-first-retry',
  },
  // RNF07: todo fluxo passa no computador e no celular.
  projects: [
    {
      name: 'computador',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'celular',
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 640 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
