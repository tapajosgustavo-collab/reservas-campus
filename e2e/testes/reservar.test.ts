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

  // 3. Abrir a janela de criação de Reserva clicando num horário livre (12:00).
  // O relógio da demo é um só e não volta (o E2E de Check-in o avança), então a Reserva fica numa
  // quinta (computador) ou sexta (celular) longe do T0: a Antecedência mínima (RN05) continua
  // valendo mesmo depois de umas horas de relógio. Dias diferentes para não colidirem no banco.
  const dia = isMobile
    ? { rotulo: 'Sexta 13/11', campo: '2026-11-13', exibida: '13/11/2026' }
    : { rotulo: 'Quinta 12/11', campo: '2026-11-12', exibida: '12/11/2026' };
  const celulaLivre = page.getByRole('button', { name: `${dia.rotulo}, 12:00: Livre` });
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

  // 4. Reservar das 12h às 14h
  const campoData = modal.getByLabel('Data');
  const selectInicio = modal.getByLabel('Início');
  const selectFim = modal.getByLabel('Fim');
  await campoData.fill(dia.campo);

  await selectInicio.click();
  await page.getByRole('option', { name: '12:00', exact: true }).click();

  await selectFim.click();
  await page.getByRole('option', { name: '14:00', exact: true }).click();

  // RN08: Espaço pede Participantes (a Sala 101 comporta 40)
  await modal.getByLabel('Participantes').fill('10');
  await modal.getByLabel('Finalidade').fill('Grupo de estudos de Engenharia de Software');
  await modal.getByRole('button', { name: 'Reservar' }).click();

  // A janela fecha com o sucesso da criação e o alerta verde aparece na agenda
  await expect(modal).not.toBeVisible();
  await conferirAcessibilidade(page);

  // Tenta reservar das 13h às 15h, em cima da Reserva que acabou de criar, para ver o Conflito
  // (RN01). Ela é a única coisa no Intervalo, então só a RN01 pode recusar.
  await page.getByRole('button', { name: `${dia.rotulo}, 14:00: Livre` }).click();
  await expect(modal).toBeVisible();
  await campoData.fill(dia.campo);

  await selectInicio.click();
  await page.getByRole('option', { name: '13:00', exact: true }).click();

  await selectFim.click();
  await page.getByRole('option', { name: '15:00', exact: true }).click();

  await modal.getByLabel('Participantes').fill('10');
  await modal.getByRole('button', { name: 'Reservar' }).click();

  // Confere que a API recusa e o quadro exibe a violação da RN01 (Sem Conflito):
  const alerta = modal.getByRole('alert');
  await expect(alerta).toBeVisible();
  await expect(alerta).toContainText('RN01');
  await expect(alerta).toContainText(/Conflito/i);
  await conferirAcessibilidade(page);

  await modal.getByRole('button', { name: 'Cancelar' }).click();
  await expect(modal).not.toBeVisible();

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
    name: new RegExp(`Sala 101.*${dia.exibida}, das 12:00 às 14:00`, 'i'),
  });
  await expect(linhaDaReserva).toBeVisible();
  await expect(linhaDaReserva).toContainText('Confirmada');
});
