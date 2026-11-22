import { expect, test, type APIRequestContext } from '@playwright/test';
import { POLITICA, type Conduta } from '@reservas/shared';
import {
  conferirAcessibilidade,
  conferirSemRolagemHorizontal,
  emSaoPaulo,
  proximoIntervaloReservavel,
} from './ajudantes';

async function lerConduta(request: APIRequestContext): Promise<Conduta> {
  const resposta = await request.get('/api/conduta');
  expect(resposta.ok(), await resposta.text()).toBe(true);
  return (await resposta.json()) as Conduta;
}

test('fluxo da conduta: Cancelamento tardio pela tela e a Penalidade em Minha conduta (US02, US13, RN16, RN19, RNF07, RNF13)', async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // 1. Um Usuário por projeto, e cada um leva uma Penalidade só: com 3 nos últimos 30 dias ele
  // ficaria suspenso (RN19) e travaria os E2E e o `npm run carga` que reservam depois com ele no
  // mesmo banco. A RN19 vale igual para Aluno e Docente.
  const nome = isMobile ? 'Bia Santos' : 'Eduardo Prado';
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(nome) }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();

  // Numa nova tentativa, o Cancelamento tardio da anterior já está lá: não gera outro.
  const antes = await lerConduta(page.request);
  let tardia = antes.penalidades.find(({ motivo }) => motivo === 'CancelamentoTardio');

  if (!tardia) {
    expect(
      antes.penalidadesQueContam,
      `${nome} já tem ${antes.penalidadesQueContam} Penalidades que contam: mais uma o suspenderia`,
    ).toBeLessThan(POLITICA.penalidadesParaSuspensao - 1);

    // 2. A Reserva Confirmada é o ponto de partida, criada pela API como no E2E de Check-in. No
    // primeiro Intervalo que a Antecedência mínima aceita (RN05), ela começa em menos de 2h: cancelar
    // é Cancelamento tardio (RN16). O relógio da demo fica parado, então o `agora` não muda.
    const sessao = await page.request.get('/api/sessao');
    expect(sessao.ok()).toBe(true);
    const { agora } = (await sessao.json()) as { agora: string };
    const { inicio, fim } = proximoIntervaloReservavel(agora);

    // Um Espaço comum livre no Intervalo (US06, RN10), para nascer Confirmada.
    const participantes = 2;
    const busca = await page.request.get('/api/recursos', {
      params: {
        tipo: 'Espaco',
        capacidadeMin: participantes,
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
      },
    });
    expect(busca.ok(), await busca.text()).toBe(true);
    const livres = (await busca.json()) as { id: number; nome: string; restrito: boolean }[];
    const recurso = livres.find(({ restrito }) => !restrito);
    if (!recurso) throw new Error('A busca não achou nenhum Espaço comum livre no Intervalo.');

    const criada = await page.request.post('/api/reservas', {
      data: {
        recursoId: recurso.id,
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        participantes,
      },
    });
    expect(criada.status(), await criada.text()).toBe(201);
    expect(((await criada.json()) as { status: string }).status).toBe('Confirmada');

    // 3. Em Minhas reservas, o Cancelar avisa que é Cancelamento tardio (US13, RN16)
    if (isMobile) {
      await page.getByRole('button', { name: 'Abrir menu' }).click();
    }
    await page.getByRole('link', { name: 'Minhas reservas' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Minhas reservas' })).toBeVisible();

    const { data, hora } = emSaoPaulo(inicio);
    const nomeNaRegex = recurso.nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linha = page.getByRole('row', {
      name: new RegExp(`${nomeNaRegex}.*${data}, das ${hora} às ${emSaoPaulo(fim).hora}`),
    });
    await expect(linha).toContainText('Confirmada');
    await linha.getByRole('button', { name: `Cancelar Reserva de ${recurso.nome}` }).click();

    const confirmacao = page.getByRole('dialog', { name: 'Cancelar reserva' });
    await expect(confirmacao).toBeVisible();
    await expect(confirmacao).toContainText(
      'cancelar agora é Cancelamento tardio e gera Penalidade',
    );

    // RNF13 e RNF07: a confirmação com o aviso
    await conferirAcessibilidade(page);
    if (isMobile) {
      await conferirSemRolagemHorizontal(page);
    }

    await confirmacao.getByRole('button', { name: 'Confirmar cancelamento' }).click();
    await expect(confirmacao).not.toBeVisible();
    // A Cancelada sai das ativas.
    await expect(linha).toHaveCount(0);

    tardia = (await lerConduta(page.request)).penalidades.find(
      ({ motivo, reserva }) => motivo === 'CancelamentoTardio' && reserva.recurso.id === recurso.id,
    );
    if (!tardia) throw new Error('O Cancelamento tardio não gerou Penalidade.');
    // A Penalidade é do instante do Cancelamento, o agora parado da demo.
    expect(Date.parse(tardia.em)).toBe(Date.parse(agora));
  }

  // 4. Minha conduta mostra a Penalidade com a data, o motivo e a Reserva de origem, e que ela
  // conta para a Suspensão, que ainda não veio (US02, RN19)
  if (isMobile) {
    await page.getByRole('button', { name: 'Abrir menu' }).click();
  }
  await page.getByRole('link', { name: 'Minha conduta' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Minha conduta' })).toBeVisible();

  const { penalidadesQueContam } = await lerConduta(page.request);
  await expect(page.getByText('Você não está suspenso.')).toBeVisible();
  await expect(
    page.getByText(
      penalidadesQueContam === 1
        ? '1 Penalidade conta agora para a Suspensão.'
        : `${penalidadesQueContam} Penalidades contam agora para a Suspensão.`,
    ),
  ).toBeVisible();

  const quando = emSaoPaulo(new Date(tardia.em));
  const origem = emSaoPaulo(new Date(tardia.reserva.inicio));
  const linhaDaPenalidade = page
    .getByRole('row')
    .filter({ hasText: 'Cancelamento tardio' })
    .filter({ hasText: `${quando.data} às ${quando.hora}` });
  await expect(linhaDaPenalidade).toHaveCount(1);
  await expect(linhaDaPenalidade).toContainText(tardia.reserva.recurso.nome);
  await expect(linhaDaPenalidade).toContainText(
    `${origem.data}, das ${origem.hora} às ${emSaoPaulo(new Date(tardia.reserva.fim)).hora}`,
  );
  await expect(linhaDaPenalidade.getByText('Conta', { exact: true })).toBeVisible();

  // RNF13 e RNF07: Minha conduta com a Penalidade
  await conferirAcessibilidade(page);
  if (isMobile) {
    await conferirSemRolagemHorizontal(page);
  }
});
