import { expect, test } from '@playwright/test';
import { conferirAcessibilidade, conferirSemRolagemHorizontal } from './ajudantes';

test('fluxo de reservar com verificação de conflito e acessibilidade (US07, RNF07, RNF13)', async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // 1. Entrar como Ana na tela de login
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Entrar' })).toBeVisible();

  // RNF13: acessibilidade na tela de login (WCAG 2.1 A e AA sem violações graves)
  await conferirAcessibilidade(page);

  // Entrar como Ana Souza (Aluno)
  await page.getByRole('button', { name: /Ana Souza/i }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();

  // 2. Ir pela busca/lista de Recursos até a agenda da Sala 101 (sem depender do id do banco)
  if (isMobile) {
    await page.getByRole('button', { name: 'Abrir menu' }).click();
  }
  await page.getByRole('link', { name: 'Recursos' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Buscar Recursos' })).toBeVisible();
  await page.getByRole('link', { name: 'Ver agenda de Sala 101' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Sala 101' })).toBeVisible();

  // RNF13: acessibilidade na agenda do Recurso
  await conferirAcessibilidade(page);

  // 3. Abrir a janela de criação de Reserva clicando num horário livre (12:00)
  // Computador usa Terça 10/11 e celular usa Quarta 11/11 para não colidirem no mesmo banco.
  const rotuloCelula = isMobile ? 'Quarta 11/11, 12:00: Livre' : 'Terça 10/11, 12:00: Livre';
  const celulaLivre = page.getByRole('button', { name: rotuloCelula });
  await expect(celulaLivre).toBeVisible();
  await celulaLivre.click();

  const modal = page.getByRole('dialog', { name: 'Nova Reserva' });
  await expect(modal).toBeVisible();

  // RNF13: acessibilidade na janela de criação de Reserva
  await conferirAcessibilidade(page);

  // RNF07: no celular, a página não rola na horizontal e o botão Reservar fica visível sem rolar
  if (isMobile) {
    await conferirSemRolagemHorizontal(page);
    await expect(modal.getByRole('button', { name: 'Reservar' })).toBeInViewport();
  }

  // Tenta reservar em cima do horário do Bruno na terça 10/11 (10:00 às 12:00) para ver o Conflito (RN01):
  const campoData = modal.getByLabel('Data');
  await campoData.fill('2026-11-10');

  const selectInicio = modal.getByLabel('Início');
  await selectInicio.click();
  await page.getByRole('option', { name: '10:00', exact: true }).click();

  const selectFim = modal.getByLabel('Fim');
  await selectFim.click();
  await page.getByRole('option', { name: '12:00', exact: true }).click();

  // RN08: Espaço pede Participantes (a Sala 101 comporta 40)
  await modal.getByLabel('Participantes').fill('10');
  await modal.getByRole('button', { name: 'Reservar' }).click();

  // Confere que a API recusa e o quadro exibe a violação da RN01 (Sem Conflito):
  const alerta = modal.getByRole('alert');
  await expect(alerta).toBeVisible();
  await expect(alerta).toContainText('RN01');
  await expect(alerta).toContainText(/Conflito/i);
  await conferirAcessibilidade(page);

  // 4. Reservar das 12h às 14h
  const dataReserva = isMobile ? '2026-11-11' : '2026-11-10';
  const dataExibida = isMobile ? '11/11/2026' : '10/11/2026';
  await campoData.fill(dataReserva);

  await selectInicio.click();
  await page.getByRole('option', { name: '12:00', exact: true }).click();

  await selectFim.click();
  await page.getByRole('option', { name: '14:00', exact: true }).click();

  await modal.getByLabel('Participantes').fill('10');
  await modal.getByLabel('Finalidade').fill('Grupo de estudos de Engenharia de Software');
  await modal.getByRole('button', { name: 'Reservar' }).click();

  // A janela fecha com o sucesso da criação e o alerta verde aparece na agenda
  await expect(modal).not.toBeVisible();
  await conferirAcessibilidade(page);

  // 5. Ver a nova Reserva em Minhas reservas
  await page.goto('/reservas');
  await expect(page.getByRole('heading', { level: 2, name: 'Minhas reservas' })).toBeVisible();

  // RNF13: acessibilidade na tela de Minhas reservas
  await conferirAcessibilidade(page);

  if (isMobile) {
    await conferirSemRolagemHorizontal(page);
  }

  // Confere que a Reserva da Sala 101 das 12h às 14h aparece na lista de Ativas como Confirmada:
  const linhaDaReserva = page.getByRole('row', {
    name: new RegExp(`Sala 101.*${dataExibida}, das 12:00 às 14:00`, 'i'),
  });
  await expect(linhaDaReserva).toBeVisible();
  await expect(linhaDaReserva).toContainText('Confirmada');
});
