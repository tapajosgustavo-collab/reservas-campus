import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from '../../../comum/banco';
import { RelogioFixo } from '../../../comum/relogio';
import { sessaoDe, umaApp } from '../../../teste/app';
import {
  bancoDeTeste,
  comBanco,
  esvaziar,
  umaReserva,
  umEquipamento,
  umEspaco,
  umUsuario,
} from '../../../teste/banco';
import { sincronizar } from './sincronizar';

let banco: Banco;

const as = (diaHora: string) => new Date(`2026-11-${diaHora}:00-03:00`);

const QUARTA_14H = {
  inicio: '2026-11-11T14:00:00-03:00',
  fim: '2026-11-11T16:00:00-03:00',
};

comBanco('sincronizar (casca e integração)', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('RN12 · Pedido Pendente não decidido até 2h antes expira sozinho, grava histórico com data do vencimento e libera Intervalo', async () => {
    const relogio = new RelogioFixo(as('11T10:00'));
    const app = await umaApp({ banco, relogio });

    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const bruno = await umUsuario(banco, 'Aluno', { nome: 'Bruno' });

    const lab = await umEspaco(banco, {
      gestorId: carlos.id,
      nome: 'Laboratório de Química',
      restrito: true,
    });

    const pedido = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: lab.id,
      ...QUARTA_14H,
      status: 'Pendente',
    });

    // Às 10h: Pedido está na fila da gestão
    const filaAntes = await app.inject({
      method: 'GET',
      url: '/api/gestao/pedidos',
      cookies: sessaoDe(app, carlos.id, relogio.agora()),
    });
    expect(filaAntes.statusCode).toBe(200);
    expect(filaAntes.json()).toHaveLength(1);

    // O relógio avança para 12h00 (2h antes do início das 14h: momento exato do prazo de decisão)
    relogio.ir(as('11T12:00'));

    // Qualquer requisição seguinte dispara o sincronizar sob o lock
    const filaDepois = await app.inject({
      method: 'GET',
      url: '/api/gestao/pedidos',
      cookies: sessaoDe(app, carlos.id, relogio.agora()),
    });
    expect(filaDepois.statusCode).toBe(200);
    expect(filaDepois.json()).toHaveLength(0); // Saiu da fila!

    // Confere no banco o status e a transição do pedido
    const pedidoNoBanco = await banco.reserva.findUniqueOrThrow({
      where: { id: pedido.id },
      include: { transicoes: { orderBy: { em: 'asc' } }, penalidade: true },
    });
    expect(pedidoNoBanco.status).toBe('Expirada');
    expect(pedidoNoBanco.penalidade).toBeNull(); // Sem penalidade (RN12)
    expect(pedidoNoBanco.transicoes).toContainEqual(
      expect.objectContaining({
        de: 'Pendente',
        para: 'Expirada',
        em: as('11T12:00'),
        porId: null,
      }),
    );

    // Confere a Notificação enviada para a Ana
    const notificacoesAna = await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessaoDe(app, ana.id, relogio.agora()),
    });
    expect(notificacoesAna.statusCode).toBe(200);
    expect(notificacoesAna.json().itens).toEqual([
      expect.objectContaining({
        tipo: 'Expiracao',
        mensagem: 'Seu Pedido de Laboratório de Química (11/11/2026, das 14:00 às 16:00) expirou.',
        em: '2026-11-11T12:00:00-03:00',
        reservaId: pedido.id,
      }),
    ]);

    // O Intervalo foi liberado: a agenda pública do Recurso mostra ocupacoes vazias
    const agenda = await app.inject({
      method: 'GET',
      url: `/api/recursos/${lab.id}/agenda?semana=2026-11-09`,
      cookies: sessaoDe(app, bruno.id, relogio.agora()),
    });
    expect(agenda.statusCode).toBe(200);
    expect(agenda.json().ocupacoes).toEqual([]);
  });

  it('US16 · Reserva Confirmada gera Notificação de Lembrete 1h antes do início com data do vencimento e sem repetir', async () => {
    const relogio = new RelogioFixo(as('11T10:00'));
    const app = await umaApp({ banco, relogio });

    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const sala = await umEspaco(banco, { gestorId: carlos.id, nome: 'Sala 101' });

    const confirmada = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: sala.id,
      ...QUARTA_14H,
      status: 'Confirmada',
    });

    // Às 12h59 (antes de 1h antes): sem notificação
    relogio.ir(as('11T12:59'));
    const notifs1 = await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessaoDe(app, ana.id, relogio.agora()),
    });
    expect(notifs1.json().itens).toHaveLength(0);

    // Às 13h00: atinge exatamente 1h antes do início
    relogio.ir(as('11T13:00'));
    const notifs2 = await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessaoDe(app, ana.id, relogio.agora()),
    });
    expect(notifs2.json().itens).toEqual([
      expect.objectContaining({
        tipo: 'Lembrete',
        mensagem:
          'Lembrete: sua Reserva de Sala 101 (11/11/2026, das 14:00 às 16:00) começa às 14:00.',
        em: '2026-11-11T13:00:00-03:00',
        reservaId: confirmada.id,
      }),
    ]);

    // Às 13h15: nova requisição não duplica o lembrete (idempotente)
    relogio.ir(as('11T13:15'));
    const notifs3 = await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessaoDe(app, ana.id, relogio.agora()),
    });
    expect(notifs3.json().itens).toHaveLength(1);
  });

  it('US16 · Lembrete processado depois do início da Reserva é descartado', async () => {
    const relogio = new RelogioFixo(as('11T10:00'));
    const app = await umaApp({ banco, relogio });

    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const sala = await umEspaco(banco, { gestorId: carlos.id, nome: 'Sala 102' });

    await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: sala.id,
      ...QUARTA_14H,
      status: 'Confirmada',
    });

    // O relógio pula direto para 14h05 (após o início às 14h00)
    relogio.ir(as('11T14:05'));

    const notifs = await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessaoDe(app, ana.id, relogio.agora()),
    });
    // O lembrete foi descartado porque a reserva já começou
    expect(notifs.json().itens).toHaveLength(0);
  });

  it('US16 · Reserva Confirmada que já começou não entra na consulta e sincronizar devolve 0 em requisições seguidas', async () => {
    // 14h10: já começou, mas ainda está na Tolerância (às 14h15 viraria Não comparecimento, RN15).
    const relogio = new RelogioFixo(as('11T14:10'));
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const sala = await umEspaco(banco, { gestorId: carlos.id, nome: 'Sala 102' });

    // Reserva das 14h às 16h; o relógio já está às 14h10 (já começou)
    await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: sala.id,
      ...QUARTA_14H,
      status: 'Confirmada',
    });

    // Primeira requisição: devolve 0 e não grava notificação
    const aplicados1 = await banco.$transaction((tx) => sincronizar(tx, relogio.agora()));
    expect(aplicados1).toBe(0);

    // Segunda requisição: continua devolvendo 0
    const aplicados2 = await banco.$transaction((tx) => sincronizar(tx, relogio.agora()));
    expect(aplicados2).toBe(0);

    const notificacoes = await banco.notificacao.findMany({ where: { destinatarioId: ana.id } });
    expect(notificacoes).toHaveLength(0);
  });

  it('RN21 · Série em recurso restrito expira todas as ocorrências e grava apenas 1 Notificação', async () => {
    const relogio = new RelogioFixo(as('11T10:00'));
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const ana = await umUsuario(banco, 'Docente', { nome: 'Ana' });
    const auditorio = await umEspaco(banco, {
      gestorId: carlos.id,
      nome: 'Auditório Principal',
      restrito: true,
    });

    const serie = await banco.serie.create({
      data: {
        usuarioId: ana.id,
        recursoId: auditorio.id,
        criadaEm: as('10T08:00'),
      },
    });

    // Semana 1: 11/11 das 12h às 14h (prazo de decisão: 10h00)
    const oc1 = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: auditorio.id,
      inicio: '2026-11-11T12:00:00-03:00',
      fim: '2026-11-11T14:00:00-03:00',
      status: 'Pendente',
      serieId: serie.id,
    });

    // Semana 2: 18/11 das 12h às 14h
    const oc2 = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: auditorio.id,
      inicio: '2026-11-18T12:00:00-03:00',
      fim: '2026-11-18T14:00:00-03:00',
      status: 'Pendente',
      serieId: serie.id,
    });

    // Sincroniza às 10h00 (momento do prazo de decisão da 1ª ocorrência)
    const aplicados = await banco.$transaction((tx) => sincronizar(tx, relogio.agora()));
    // 2 StatusMudou + 1 NotificacaoEmitida = 3 efeitos
    expect(aplicados).toBe(3);

    const oc1Db = await banco.reserva.findUniqueOrThrow({ where: { id: oc1.id } });
    const oc2Db = await banco.reserva.findUniqueOrThrow({ where: { id: oc2.id } });
    expect(oc1Db.status).toBe('Expirada');
    expect(oc2Db.status).toBe('Expirada');

    const notificacoes = await banco.notificacao.findMany({ where: { destinatarioId: ana.id } });
    expect(notificacoes).toEqual([
      expect.objectContaining({
        tipo: 'Expiracao',
        mensagem: 'Seu Pedido em Série de Auditório Principal expirou.',
        em: as('11T10:00'),
        reservaId: oc1.id,
      }),
    ]);
  });

  it('RN15_Confirmada sem Check-in vira Não comparecimento com Penalidade datada no fim da Tolerância, mesmo com o servidor dormindo', async () => {
    const relogio = new RelogioFixo(as('11T13:30'));
    const app = await umaApp({ banco, relogio });

    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const bruno = await umUsuario(banco, 'Aluno', { nome: 'Bruno' });
    const sala = await umEspaco(banco, { gestorId: carlos.id, nome: 'Sala 101' });
    const reserva = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: sala.id,
      ...QUARTA_14H,
      status: 'Confirmada',
    });

    // Ninguém faz Check-in, e a próxima requisição só chega às 18h (servidor dormindo).
    relogio.ir(as('11T18:00'));
    const notificacoes = await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessaoDe(app, ana.id, relogio.agora()),
    });

    expect(notificacoes.json().itens).toEqual([
      expect.objectContaining({
        tipo: 'Penalidade',
        mensagem:
          'Você recebeu uma Penalidade por Não comparecimento na Reserva de Sala 101 (11/11/2026, das 14:00 às 16:00).',
        em: '2026-11-11T14:15:00-03:00',
        reservaId: reserva.id,
      }),
    ]);
    const noBanco = await banco.reserva.findUniqueOrThrow({
      where: { id: reserva.id },
      include: { transicoes: true, penalidade: true },
    });
    expect(noBanco.status).toBe('NaoComparecimento');
    expect(noBanco.transicoes).toContainEqual(
      expect.objectContaining({
        de: 'Confirmada',
        para: 'NaoComparecimento',
        em: as('11T14:15'),
        porId: null,
      }),
    );
    expect(noBanco.penalidade).toMatchObject({
      usuarioId: ana.id,
      motivo: 'NaoComparecimento',
      em: as('11T14:15'),
      suspensaoId: null,
    });

    // O Intervalo foi liberado, e a requisição seguinte não gera outra Penalidade.
    const agenda = await app.inject({
      method: 'GET',
      url: `/api/recursos/${sala.id}/agenda?semana=2026-11-09`,
      cookies: sessaoDe(app, bruno.id, relogio.agora()),
    });
    expect(agenda.json().ocupacoes).toEqual([]);
    expect(await banco.$transaction((tx) => sincronizar(tx, relogio.agora()))).toBe(0);
    expect(await banco.penalidade.count()).toBe(1);
  });

  it('RN15_depois do fim da Tolerância, a Reserva passada sem Check-in não ocupa mais a Cota (RN07)', async () => {
    const relogio = new RelogioFixo(as('10T08:00'));
    const app = await umaApp({ banco, relogio });
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const sala = await umEspaco(banco, {
      horarios: {
        create: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, abre: 7 * 60, fecha: 23 * 60 })),
      },
    });
    // A Cota de Aluno é 3: duas Confirmadas da semana passada, sem Check-in, e uma de amanhã. Com
    // três faltas, a Ana seria suspensa (RN19) e a RN09 recusaria a Reserva por outro motivo.
    for (const dia of ['02', '03', '11']) {
      await umaReserva(banco, {
        usuarioId: ana.id,
        recursoId: sala.id,
        inicio: `2026-11-${dia}T10:00:00-03:00`,
        fim: `2026-11-${dia}T12:00:00-03:00`,
      });
    }

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/reservas',
      cookies: sessaoDe(app, ana.id, relogio.agora()),
      payload: {
        recursoId: sala.id,
        inicio: '2026-11-10T10:00:00-03:00',
        fim: '2026-11-10T12:00:00-03:00',
        participantes: 10,
      },
    });

    expect(resposta.statusCode).toBe(201);
  });

  it('RN18_Espaço Em uso vira Concluída no fim do Intervalo; Equipamento Em uso continua Em uso', async () => {
    const relogio = new RelogioFixo(as('11T15:00'));
    const app = await umaApp({ banco, relogio });
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const sala = await umEspaco(banco, { gestorId: carlos.id });
    const notebook = await umEquipamento(banco, { gestorId: carlos.id });
    const espacoEmUso = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: sala.id,
      ...QUARTA_14H,
      status: 'EmUso',
    });
    const equipamentoEmUso = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: notebook.id,
      ...QUARTA_14H,
      status: 'EmUso',
    });

    // Às 16h, no fim do Intervalo.
    relogio.ir(as('11T16:00'));
    const resposta = await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessaoDe(app, ana.id, relogio.agora()),
    });
    expect(resposta.statusCode).toBe(200);

    const espaco = await banco.reserva.findUniqueOrThrow({
      where: { id: espacoEmUso.id },
      include: { transicoes: true, penalidade: true },
    });
    expect(espaco.status).toBe('Concluida');
    expect(espaco.penalidade).toBeNull();
    expect(espaco.transicoes).toContainEqual(
      expect.objectContaining({ de: 'EmUso', para: 'Concluida', em: as('11T16:00'), porId: null }),
    );
    const equipamento = await banco.reserva.findUniqueOrThrow({
      where: { id: equipamentoEmUso.id },
    });
    expect(equipamento.status).toBe('EmUso');
  });

  it('função sincronizar(tx, agora) devolve a quantidade de efeitos gravados e é idempotente', async () => {
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const sala = await umEspaco(banco, {
      gestorId: carlos.id,
      nome: 'Sala 101',
      restrito: true,
    });

    await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: sala.id,
      ...QUARTA_14H,
      status: 'Pendente',
    });

    // Às 12h30, o pedido já expirou às 12h00
    const agora = as('11T12:30');

    // Primeira execução: grava 2 efeitos (StatusMudou + NotificacaoEmitida)
    const aplicados1 = await banco.$transaction((tx) => sincronizar(tx, agora));
    expect(aplicados1).toBe(2);

    // Segunda execução com o mesmo instante: 0 efeitos (idempotente)
    const aplicados2 = await banco.$transaction((tx) => sincronizar(tx, agora));
    expect(aplicados2).toBe(0);
  });

  /** Exemplo das 12h15 (RN17, RN23): o Eduardo com o N-01 das 10h às 12h, a Bia das 12h às 14h. */
  async function notebookQueNaoVoltou() {
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const eduardo = await umUsuario(banco, 'Docente', { nome: 'Eduardo Prado' });
    const bia = await umUsuario(banco, 'Aluno', { nome: 'Bia' });
    const notebook = await umEquipamento(banco, {
      gestorId: carlos.id,
      nome: 'Notebook Dell N-01',
      patrimonio: 'N-01',
    });
    const doEduardo = await umaReserva(banco, {
      usuarioId: eduardo.id,
      recursoId: notebook.id,
      inicio: '2026-11-11T10:00:00-03:00',
      fim: '2026-11-11T12:00:00-03:00',
      status: 'EmUso',
    });
    const daBia = await umaReserva(banco, {
      usuarioId: bia.id,
      recursoId: notebook.id,
      inicio: '2026-11-11T12:00:00-03:00',
      fim: '2026-11-11T14:00:00-03:00',
    });
    return { carlos, eduardo, bia, notebook, doEduardo, daBia };
  }

  const notificacoesDa = (reservaId: number) =>
    banco.notificacao.findMany({
      where: { reservaId },
      select: { destinatarioId: true, tipo: true, em: true },
      orderBy: { id: 'asc' },
    });

  it('RN17 · Equipamento sem Devolução: no fim da Tolerância de Devolução, uma Penalidade e Notificação ao Usuário e ao Gestor, mesmo com o servidor dormindo; continua Em uso até a Devolução', async () => {
    const relogio = new RelogioFixo(as('11T12:14'));
    const app = await umaApp({ banco, relogio });
    const { carlos, eduardo, doEduardo } = await notebookQueNaoVoltou();

    await banco.$transaction((tx) => sincronizar(tx, relogio.agora()));
    expect(await banco.penalidade.count()).toBe(0);

    // O servidor dormiu das 12h14 às 18h: a primeira requisição põe o tempo em dia.
    relogio.ir(as('11T18:00'));
    const emUso = await app.inject({
      method: 'GET',
      url: '/api/gestao/em-uso',
      cookies: sessaoDe(app, carlos.id, relogio.agora()),
    });
    expect(emUso.json()).toMatchObject([{ id: doEduardo.id, devolucaoAtrasada: true }]);

    expect(
      await banco.penalidade.findMany({
        select: { reservaId: true, usuarioId: true, motivo: true, em: true },
      }),
    ).toEqual([
      {
        reservaId: doEduardo.id,
        usuarioId: eduardo.id,
        motivo: 'DevolucaoAtrasada',
        em: as('11T12:15'),
      },
    ]);
    expect(await notificacoesDa(doEduardo.id)).toEqual([
      { destinatarioId: eduardo.id, tipo: 'DevolucaoAtrasada', em: as('11T12:15') },
      { destinatarioId: carlos.id, tipo: 'DevolucaoAtrasada', em: as('11T12:15') },
    ]);
    expect((await banco.reserva.findUniqueOrThrow({ where: { id: doEduardo.id } })).status).toBe(
      'EmUso',
    );

    // Requisições seguintes não repetem nada: o reserva_id único marca o atraso já penalizado.
    expect(await banco.$transaction((tx) => sincronizar(tx, as('11T18:00')))).toBe(0);
    expect(await banco.$transaction((tx) => sincronizar(tx, as('12T09:00')))).toBe(0);

    // A Devolução que vem depois encerra a Reserva sem outra Penalidade.
    const devolucao = await app.inject({
      method: 'POST',
      url: `/api/reservas/${doEduardo.id}/devolucao`,
      cookies: sessaoDe(app, carlos.id, relogio.agora()),
      payload: {},
    });
    expect(devolucao.json().status).toBe('Concluida');
    expect(await banco.penalidade.count()).toBe(1);
  });

  it('RN23 · exemplo das 12h15: sem Devolução, a Reserva seguinte do Equipamento é cancelada pelo sistema, sem Penalidade e com Notificação, no mesmo instante da Penalidade da anterior', async () => {
    const relogio = new RelogioFixo(as('11T12:15'));
    const app = await umaApp({ banco, relogio });
    const { bia, eduardo, doEduardo, daBia } = await notebookQueNaoVoltou();

    // A Bia nem tentou o Check-in: só abre as Notificações dela.
    const notificacoes = await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessaoDe(app, bia.id, relogio.agora()),
    });
    expect(notificacoes.json().itens).toMatchObject([
      {
        tipo: 'CancelamentoPeloSistema',
        mensagem: expect.stringContaining('foi cancelada pelo sistema, sem Penalidade'),
        em: '2026-11-11T12:15:00-03:00',
        reservaId: daBia.id,
      },
    ]);

    const reservaDaBia = await banco.reserva.findUniqueOrThrow({
      where: { id: daBia.id },
      include: { transicoes: true, penalidade: true },
    });
    expect(reservaDaBia.status).toBe('Cancelada');
    expect(reservaDaBia.penalidade).toBeNull();
    expect(reservaDaBia.transicoes).toEqual([
      expect.objectContaining({
        de: 'Confirmada',
        para: 'Cancelada',
        em: as('11T12:15'),
        porId: null,
        observacao: expect.stringContaining('RN23'),
      }),
    ]);
    expect(
      await banco.penalidade.findMany({ select: { usuarioId: true, reservaId: true } }),
    ).toEqual([{ usuarioId: eduardo.id, reservaId: doEduardo.id }]);
  });

  it('RN23 · servidor dormindo: processado às 16h, a Reserva seguinte vira Cancelada às 12h15, não Não comparecimento', async () => {
    const { daBia } = await notebookQueNaoVoltou();

    // RN17: Penalidade e duas Notificações; RN23: Cancelamento e uma Notificação.
    expect(await banco.$transaction((tx) => sincronizar(tx, as('11T16:00')))).toBe(5);

    const reservaDaBia = await banco.reserva.findUniqueOrThrow({
      where: { id: daBia.id },
      include: { transicoes: true, penalidade: true },
    });
    expect(reservaDaBia).toMatchObject({ status: 'Cancelada', penalidade: null });
    expect(reservaDaBia.transicoes).toMatchObject([{ para: 'Cancelada', em: as('11T12:15') }]);
    expect(await banco.$transaction((tx) => sincronizar(tx, as('11T16:00')))).toBe(0);
  });

  it('RN23 · o Equipamento voltou antes do fim da Tolerância: a Reserva seguinte sem Check-in segue a RN15', async () => {
    const { bia, doEduardo, daBia } = await notebookQueNaoVoltou();
    await banco.reserva.update({ where: { id: doEduardo.id }, data: { status: 'Concluida' } });

    await banco.$transaction((tx) => sincronizar(tx, as('11T12:15')));

    expect((await banco.reserva.findUniqueOrThrow({ where: { id: daBia.id } })).status).toBe(
      'NaoComparecimento',
    );
    expect(await banco.penalidade.findMany({ select: { usuarioId: true, motivo: true } })).toEqual([
      { usuarioId: bia.id, motivo: 'NaoComparecimento' },
    ]);
  });
});
