import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from '../../../comum/banco';
import { RelogioFixo } from '../../../comum/relogio';
import { sessaoDe, umaApp } from '../../../teste/app';
import {
  bancoDeTeste,
  comBanco,
  esvaziar,
  umaReserva,
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
    const relogio = new RelogioFixo(as('11T14:30'));
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const sala = await umEspaco(banco, { gestorId: carlos.id, nome: 'Sala 102' });

    // Reserva das 14h às 16h; o relógio já está às 14h30 (já começou)
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
});
