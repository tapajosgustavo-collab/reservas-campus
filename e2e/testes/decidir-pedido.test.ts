import { expect, test, type Page } from '@playwright/test';
import { conferirAcessibilidade, conferirSemRolagemHorizontal } from './ajudantes';

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * O primeiro dia útil a partir de D+2 no calendário de São Paulo: longe o bastante para a
 * Antecedência mínima do Recurso restrito (24h, RN05) e perto o bastante para a Antecedência
 * máxima do Aluno (14 dias). O `agora` da API já vem em `-03:00`, então a data dele é a de São Paulo.
 */
function diaUtilDepoisDeAmanha(agora: string): string {
  let dia = new Date(Date.parse(`${agora.slice(0, 10)}T00:00:00Z`) + 2 * UM_DIA_MS);
  while (dia.getUTCDay() === 0 || dia.getUTCDay() === 6) {
    dia = new Date(dia.getTime() + UM_DIA_MS);
  }
  return dia.toISOString().slice(0, 10);
}

async function entrarComo(page: Page, nome: string) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(nome) }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
}

async function sair(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Entrar' })).toBeVisible();
}

async function abrirNoMenu(page: Page, isMobile: boolean, rotulo: string) {
  if (isMobile) {
    await page.getByRole('button', { name: 'Abrir menu' }).click();
  }
  await page.getByRole('link', { name: rotulo }).click();
}

/** O e-mail do seed de cada Aluno que este teste usa. */
const EMAIL = { 'Bruno Lima': 'bruno.demo@unifesp.br', 'Bia Santos': 'bia.demo@unifesp.br' };

test('fluxo de decidir Pedido: o Aluno pede, a Dora aprova na fila e o Aluno é notificado (US10, US11, US16, RNF07, RNF13)', async ({
  page,
  request,
  isMobile,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // Um Aluno por projeto, e nenhum deles é a Ana: o E2E de reservar leva a Ana até o limite da
  // Cota (RN07). Cada projeto (e cada nova tentativa) também usa um horário próprio, para um não
  // dar Conflito com o outro no mesmo banco (RN01). O Auditório já vem restrito do seed (RN10).
  const aluno = isMobile ? 'Bia Santos' : 'Bruno Lima';
  const hora = 14 + (isMobile ? 2 : 0) + testInfo.retry * 4;
  const inicio = `${hora}:00`;
  const fim = `${hora + 1}:00`;
  const finalidade = `Ensaio do seminário (${testInfo.project.name})`;
  let reservaId: number | undefined;

  try {
    // 1. O Aluno envia o Pedido pela agenda do Auditório (US10)
    await entrarComo(page, aluno);
    const sessao = await page.request.get('/api/sessao');
    const { agora } = (await sessao.json()) as { agora: string };
    const data = diaUtilDepoisDeAmanha(agora);
    const [ano, mes, dia] = data.split('-');

    await abrirNoMenu(page, isMobile, 'Recursos');
    await page.getByRole('link', { name: 'Ver agenda de Auditório' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Auditório' })).toBeVisible();
    await page
      .getByRole('button', { name: /: Livre$/ })
      .first()
      .click();

    const janela = page.getByRole('dialog', { name: 'Novo Pedido' });
    await expect(janela).toBeVisible();
    await janela.getByLabel('Data').fill(data);
    await janela.getByLabel('Início').click();
    await page.getByRole('option', { name: inicio, exact: true }).click();
    await janela.getByLabel('Fim').click();
    await page.getByRole('option', { name: fim, exact: true }).click();
    await janela.getByLabel('Participantes').fill('80');
    await janela.getByLabel('Finalidade').fill(finalidade);
    await expect(
      janela.getByText(/Recurso restrito: o Pedido fica Pendente até Dora Alves aprovar/),
    ).toBeVisible();
    const criacao = page.waitForResponse(
      (resposta) =>
        resposta.url().endsWith('/api/reservas') && resposta.request().method() === 'POST',
    );
    await janela.getByRole('button', { name: 'Enviar pedido' }).click();
    const resposta = await criacao;
    expect(resposta.status(), await resposta.text()).toBe(201);
    reservaId = ((await resposta.json()) as { id: number }).id;
    await expect(janela).not.toBeVisible();
    await sair(page);

    // 2. A Dora acha o Pedido na fila e aprova (US11)
    await entrarComo(page, 'Dora Alves');
    await abrirNoMenu(page, isMobile, 'Pedidos');
    await expect(page.getByRole('heading', { level: 2, name: 'Pedidos' })).toBeVisible();
    const linha = page.getByRole('row').filter({ hasText: finalidade });
    await expect(linha).toContainText('Auditório');
    await expect(linha).toContainText(aluno);
    await expect(linha).toContainText('80/150');

    // RNF13 e RNF07: a fila com o Pedido; no celular, só a tabela rola na horizontal
    await conferirAcessibilidade(page);
    if (isMobile) {
      await conferirSemRolagemHorizontal(page);
    }

    await linha.getByRole('button', { name: /^Aprovar o Pedido/ }).click();
    await expect(page.getByRole('status')).toContainText('Pedido aprovado');
    await expect(linha).toHaveCount(0);
    await conferirAcessibilidade(page);
    await sair(page);

    // 3. O Aluno vê a Notificação da Aprovação no sino (US16)
    await entrarComo(page, aluno);
    const mensagem = `Seu Pedido de Auditório (${dia}/${mes}/${ano}, das ${inicio} às ${fim}) foi aprovado.`;
    await page.getByRole('button', { name: /^Notificações \(\d+ não lidas?\)$/ }).click();
    const notificacoes = page.getByRole('dialog', { name: 'Notificações' });
    // A mais recente vem primeiro; rodar de novo no mesmo banco deixa a da rodada anterior embaixo
    await expect(notificacoes.getByText(mensagem).first()).toBeVisible();

    // RNF13 e RNF07: a lista de Notificações aberta
    await conferirAcessibilidade(page);
    if (isMobile) {
      await conferirSemRolagemHorizontal(page);
    }
  } finally {
    // O Aluno cancela o que o teste criou, Pendente ou aprovado, mesmo se um passo falhou: assim a
    // próxima tentativa ainda cabe na Cota dele (RN07).
    if (reservaId !== undefined) {
      const entrada = await request.post('/api/sessao', { data: { email: EMAIL[aluno] } });
      expect(entrada.ok(), await entrada.text()).toBe(true);
      const cancelamento = await request.post(`/api/reservas/${reservaId}/cancelamento`);
      expect(cancelamento.ok(), await cancelamento.text()).toBe(true);
    }
  }
});
