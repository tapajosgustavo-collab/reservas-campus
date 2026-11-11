import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from '../../../comum/banco';
import { RelogioFixo } from '../../../comum/relogio';
import { sessaoDe, umaApp } from '../../../teste/app';
import {
  bancoDeTeste,
  comBanco,
  esvaziar,
  umaNotificacao,
  umaReserva,
  umEspaco,
  umUsuario,
} from '../../../teste/banco';

let banco: Banco;

type App = Awaited<ReturnType<typeof umaApp>>;

/** Em São Paulo: `as('10T09:00')` é terça, 10/11/2026, às 9h. */
const as = (diaHora: string) => new Date(`2026-11-${diaHora}:00-03:00`);

let agoraDoTeste: Date;

function umaAppAs(diaHora: string) {
  agoraDoTeste = as(diaHora);
  return umaApp({ banco, relogio: new RelogioFixo(agoraDoTeste) });
}

const sessao = (app: App, usuarioId: number) => sessaoDe(app, usuarioId, agoraDoTeste);

const QUARTA_14H = { inicio: '2026-11-11T14:00:00-03:00', fim: '2026-11-11T16:00:00-03:00' };

comBanco('US16 · Notificações', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('Aprovação, Recusa e Cancelamento pelo sistema geram Notificações para o dono da Reserva', async () => {
    const app = await umaAppAs('10T09:00');
    const carlos = await umUsuario(banco, 'Gestor', { nome: 'Carlos' });
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const bia = await umUsuario(banco, 'Aluno', { nome: 'Bia' });
    const laboratorio = await umEspaco(banco, {
      gestorId: carlos.id,
      nome: 'Laboratório de Química',
      restrito: true,
    });
    const sala102 = await umEspaco(banco, { gestorId: carlos.id, nome: 'Sala 102' });

    const pedidoAprovado = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: laboratorio.id,
      ...QUARTA_14H,
      status: 'Pendente',
    });
    const pedidoRecusado = await umaReserva(banco, {
      usuarioId: ana.id,
      recursoId: laboratorio.id,
      inicio: '2026-11-12T14:00:00-03:00',
      fim: '2026-11-12T16:00:00-03:00',
      status: 'Pendente',
    });
    const reservaDaBia = await umaReserva(banco, {
      usuarioId: bia.id,
      recursoId: sala102.id,
      inicio: '2026-11-11T10:00:00-03:00',
      fim: '2026-11-11T12:00:00-03:00',
      status: 'Confirmada',
    });

    const rAprovacao = await app.inject({
      method: 'POST',
      url: `/api/reservas/${pedidoAprovado.id}/aprovacao`,
      cookies: sessao(app, carlos.id),
    });
    expect(rAprovacao.statusCode).toBe(200);

    const rRecusa = await app.inject({
      method: 'POST',
      url: `/api/reservas/${pedidoRecusado.id}/recusa`,
      cookies: sessao(app, carlos.id),
      payload: { justificativa: '  Manutenção na capela de exaustão.  ' },
    });
    expect(rRecusa.statusCode).toBe(200);

    const rIndisponibilidade = await app.inject({
      method: 'POST',
      url: `/api/recursos/${sala102.id}/indisponibilidades`,
      cookies: sessao(app, carlos.id),
      payload: {
        inicio: '2026-11-11T08:00:00-03:00',
        fim: '2026-11-11T18:00:00-03:00',
        motivo: 'Dedetização',
      },
    });
    expect(rIndisponibilidade.statusCode).toBe(201);

    const daAna = await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessao(app, ana.id),
    });
    expect(daAna.statusCode).toBe(200);
    expect(daAna.json()).toEqual({
      total: 2,
      naoLidas: 2,
      itens: [
        {
          id: expect.any(Number),
          tipo: 'Recusa',
          mensagem:
            'Seu Pedido de Laboratório de Química (12/11/2026, das 14:00 às 16:00) foi recusado: Manutenção na capela de exaustão.',
          em: '2026-11-10T09:00:00-03:00',
          lidaEm: null,
          reservaId: pedidoRecusado.id,
        },
        {
          id: expect.any(Number),
          tipo: 'Aprovacao',
          mensagem:
            'Seu Pedido de Laboratório de Química (11/11/2026, das 14:00 às 16:00) foi aprovado.',
          em: '2026-11-10T09:00:00-03:00',
          lidaEm: null,
          reservaId: pedidoAprovado.id,
        },
      ],
    });

    const daBia = await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessao(app, bia.id),
    });
    expect(daBia.statusCode).toBe(200);
    expect(daBia.json()).toEqual({
      total: 1,
      naoLidas: 1,
      itens: [
        {
          id: expect.any(Number),
          tipo: 'CancelamentoPeloSistema',
          mensagem:
            'Sua Reserva de Sala 102 (11/11/2026, das 10:00 às 12:00) foi cancelada pelo sistema: o Recurso ficou indisponível (Dedetização).',
          em: '2026-11-10T09:00:00-03:00',
          lidaEm: null,
          reservaId: reservaDaBia.id,
        },
      ],
    });
  });

  it('GET /api/notificacoes?pagina=1 → mais novas primeiro, 20 por página, só as do Usuário da sessão', async () => {
    const app = await umaAppAs('10T09:00');
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const bruno = await umUsuario(banco, 'Aluno', { nome: 'Bruno' });

    for (let i = 1; i <= 22; i++) {
      const hora = String(Math.floor((i - 1) / 2)).padStart(2, '0');
      const min = i % 2 === 1 ? '00' : '30';
      await umaNotificacao(banco, {
        destinatarioId: ana.id,
        mensagem: `Aviso ${i}`,
        em: `2026-11-10T${hora}:${min}:00-03:00`,
        lidaEm: i <= 2 ? '2026-11-10T08:00:00-03:00' : null,
      });
    }
    await umaNotificacao(banco, { destinatarioId: bruno.id, mensagem: 'Do Bruno' });

    const pagina1 = await app.inject({
      method: 'GET',
      url: '/api/notificacoes?pagina=1',
      cookies: sessao(app, ana.id),
    });
    expect(pagina1.statusCode).toBe(200);
    expect(pagina1.json().total).toBe(22);
    expect(pagina1.json().naoLidas).toBe(20);
    expect(pagina1.json().itens).toHaveLength(20);
    expect(pagina1.json().itens[0].mensagem).toBe('Aviso 22');
    expect(pagina1.json().itens[19].mensagem).toBe('Aviso 3');

    const pagina2 = await app.inject({
      method: 'GET',
      url: '/api/notificacoes?pagina=2',
      cookies: sessao(app, ana.id),
    });
    expect(pagina2.statusCode).toBe(200);
    expect(pagina2.json().total).toBe(22);
    expect(pagina2.json().naoLidas).toBe(20);
    expect(pagina2.json().itens.map((item: { mensagem: string }) => item.mensagem)).toEqual([
      'Aviso 2',
      'Aviso 1',
    ]);
  });

  it('POST /api/notificacoes/:id/leitura → 204 para o destinatário, 403 para outro Usuário e 404 se não existe', async () => {
    const app = await umaAppAs('10T09:00');
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const bruno = await umUsuario(banco, 'Aluno', { nome: 'Bruno' });
    const notificacao = await umaNotificacao(banco, {
      destinatarioId: ana.id,
      em: '2026-11-10T08:00:00-03:00',
    });

    const proibido = await app.inject({
      method: 'POST',
      url: `/api/notificacoes/${notificacao.id}/leitura`,
      cookies: sessao(app, bruno.id),
    });
    expect(proibido.statusCode).toBe(403);
    expect(proibido.json().erro.codigo).toBe('proibido');

    const naoExiste = await app.inject({
      method: 'POST',
      url: '/api/notificacoes/999999/leitura',
      cookies: sessao(app, ana.id),
    });
    expect(naoExiste.statusCode).toBe(404);
    expect(naoExiste.json().erro.codigo).toBe('nao_encontrado');

    const leitura = await app.inject({
      method: 'POST',
      url: `/api/notificacoes/${notificacao.id}/leitura`,
      cookies: sessao(app, ana.id),
    });
    expect(leitura.statusCode).toBe(204);

    const lista = await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessao(app, ana.id),
    });
    expect(lista.json()).toMatchObject({
      total: 1,
      naoLidas: 0,
      itens: [{ id: notificacao.id, lidaEm: '2026-11-10T09:00:00-03:00' }],
    });
  });

  it('POST /api/notificacoes/leitura → 204 e marca todas as não lidas do Usuário sem tocar nas de outros', async () => {
    const app = await umaAppAs('10T09:00');
    const ana = await umUsuario(banco, 'Aluno', { nome: 'Ana' });
    const bruno = await umUsuario(banco, 'Aluno', { nome: 'Bruno' });
    const jaLida = await umaNotificacao(banco, {
      destinatarioId: ana.id,
      em: '2026-11-10T07:00:00-03:00',
      lidaEm: '2026-11-10T07:30:00-03:00',
    });
    const nova = await umaNotificacao(banco, {
      destinatarioId: ana.id,
      em: '2026-11-10T08:00:00-03:00',
    });
    const doBruno = await umaNotificacao(banco, {
      destinatarioId: bruno.id,
      em: '2026-11-10T08:00:00-03:00',
    });

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/notificacoes/leitura',
      cookies: sessao(app, ana.id),
    });
    expect(resposta.statusCode).toBe(204);

    const daAna = await app.inject({
      method: 'GET',
      url: '/api/notificacoes',
      cookies: sessao(app, ana.id),
    });
    expect(daAna.json()).toMatchObject({
      total: 2,
      naoLidas: 0,
      itens: [
        { id: nova.id, lidaEm: '2026-11-10T09:00:00-03:00' },
        { id: jaLida.id, lidaEm: '2026-11-10T07:30:00-03:00' },
      ],
    });

    const doBrunoNoBanco = await banco.notificacao.findUniqueOrThrow({ where: { id: doBruno.id } });
    expect(doBrunoNoBanco.lidaEm).toBeNull();
  });

  it('sem sessão → 401 nas três rotas de Notificações', async () => {
    const app = await umaAppAs('10T09:00');
    for (const [method, url] of [
      ['GET', '/api/notificacoes'],
      ['POST', '/api/notificacoes/1/leitura'],
      ['POST', '/api/notificacoes/leitura'],
    ] as const) {
      const resposta = await app.inject({ method, url });
      expect(resposta.statusCode).toBe(401);
    }
  });
});
