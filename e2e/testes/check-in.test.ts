import { expect, test } from '@playwright/test';
import {
  conferirAcessibilidade,
  conferirSemRolagemHorizontal,
  emSaoPaulo,
  janelaDoCheckIn,
  proximoIntervaloReservavel,
} from './ajudantes';

test('fluxo de Check-in avançando o relógio da demo (US12, RN14, RNF02, RNF07, RNF13)', async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // 1. Entrar como Eduardo (Docente, Cota de 10: as Reservas deste teste não esbarram na RN07)
  await page.goto('/');
  await page.getByRole('button', { name: /Eduardo Prado/i }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();

  // 2. A Reserva Confirmada é o ponto de partida; criar pela tela é o E2E de reservar. O relógio
  // da demo é um só e não volta: a Reserva fica no primeiro Intervalo que a Antecedência mínima
  // aceita (RN05) a partir do agora do servidor, e o relógio só anda até a janela dela.
  const sessao = await page.request.get('/api/sessao');
  expect(sessao.ok()).toBe(true);
  const { agora } = (await sessao.json()) as { agora: string };
  const { inicio, fim } = proximoIntervaloReservavel(agora);

  // Um Espaço por projeto, para os dois nunca disputarem o mesmo Intervalo (RN01).
  const nomeDoRecurso = isMobile ? 'Laboratório de Informática 2' : 'Sala 102';
  const busca = await page.request.get('/api/recursos', { params: { q: nomeDoRecurso } });
  expect(busca.ok()).toBe(true);
  const recursos = (await busca.json()) as { id: number; nome: string }[];
  const recurso = recursos.find(({ nome }) => nome === nomeDoRecurso);
  expect(recurso, `o seed não tem o Recurso "${nomeDoRecurso}"`).toBeDefined();

  const criada = await page.request.post('/api/reservas', {
    data: {
      recursoId: recurso?.id,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      participantes: 5,
    },
  });
  expect(criada.status(), await criada.text()).toBe(201);
  expect(((await criada.json()) as { status: string }).status).toBe('Confirmada');

  // 3. Em Minhas reservas, a Reserva está Confirmada e, antes da janela, sem Check-in (RN14)
  if (isMobile) {
    await page.getByRole('button', { name: 'Abrir menu' }).click();
  }
  await page.getByRole('link', { name: 'Minhas reservas' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Minhas reservas' })).toBeVisible();

  const { data, hora: horaDoInicio } = emSaoPaulo(inicio);
  const linha = page.getByRole('row', {
    name: new RegExp(`${nomeDoRecurso}.*${data}, das ${horaDoInicio} às ${emSaoPaulo(fim).hora}`),
  });
  await expect(linha).toContainText('Confirmada');
  const botaoDeCheckIn = linha.getByRole('button', {
    name: `Fazer Check-in da Reserva de ${nomeDoRecurso}`,
  });
  await expect(botaoDeCheckIn).toHaveCount(0);

  // 4. A barra do relógio da demo (POST /api/demo/relogio) leva o agora até a janela do Check-in
  const relogio = page.getByRole('region', { name: 'Relógio da demonstração' });
  const abre = emSaoPaulo(janelaDoCheckIn(inicio));
  await relogio.getByLabel('Ir para data e hora').fill(abre.campo);
  await relogio.getByRole('button', { name: 'Ir', exact: true }).click();
  await expect(relogio).toContainText(`Agora no servidor: ${abre.data} às ${abre.hora}`);

  // RNF13 e RNF07: Minhas reservas com o botão de Check-in à vista
  await expect(botaoDeCheckIn).toBeVisible();
  await conferirAcessibilidade(page);
  if (isMobile) {
    await conferirSemRolagemHorizontal(page);
  }

  // 5. Check-in: a Reserva fica Em uso, na lista e no detalhe
  await botaoDeCheckIn.click();
  await expect(linha).toContainText('Em uso');
  await expect(botaoDeCheckIn).toHaveCount(0);

  await linha.getByRole('link', { name: `Detalhes da Reserva de ${nomeDoRecurso}` }).click();
  await expect(page.getByRole('heading', { level: 2, name: nomeDoRecurso })).toBeVisible();
  await expect(page.getByText('Status: Em uso')).toBeVisible();
  await expect(page.getByRole('row', { name: /Confirmada → Em uso/ })).toBeVisible();

  // RNF13 e RNF07: o detalhe da Reserva depois do Check-in
  await conferirAcessibilidade(page);
  if (isMobile) {
    await conferirSemRolagemHorizontal(page);
  }
});
