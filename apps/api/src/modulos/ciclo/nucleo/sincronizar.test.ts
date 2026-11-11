import { describe, expect, it } from 'vitest';
import { sincronizar, vencimentos, type Mundo, type ReservaDoCiclo } from './sincronizar';

const ANA = { id: 7 };
const BRUNO = { id: 8 };

/** Em São Paulo. Quarta, 11/11/2026. */
const em = (diaHora: string) => new Date(`2026-11-${diaHora}:00-03:00`);

const POLITICA = {
  prazoDeDecisaoMin: 120,
  lembreteAntesDoInicioMin: 60,
};

const umaReserva = (dados: Partial<ReservaDoCiclo> = {}): ReservaDoCiclo => ({
  id: 42,
  usuarioId: ANA.id,
  status: 'Pendente',
  inicio: em('11T14:00'),
  fim: em('11T16:00'),
  recurso: { nome: 'Laboratório de Química' },
  ...dados,
});

describe('vencimentos(mundo)', () => {
  it('Pedido Pendente gera vencimento de Expiração (RN12) 2h antes do início', () => {
    const pedido = umaReserva({ id: 10, status: 'Pendente', inicio: em('11T14:00') });
    const lista = vencimentos({ reservas: [pedido], politica: POLITICA });
    expect(lista).toEqual([
      {
        em: em('11T12:00'),
        regra: 'RN12',
        tipo: 'Expiracao',
        reserva: pedido,
      },
    ]);
  });

  it('Reserva Confirmada sem lembrete gera vencimento de Lembrete (US16) 1h antes do início', () => {
    const confirmada = umaReserva({ id: 11, status: 'Confirmada', inicio: em('11T14:00') });
    const lista = vencimentos({ reservas: [confirmada], politica: POLITICA });
    expect(lista).toEqual([
      {
        em: em('11T13:00'),
        regra: 'US16',
        tipo: 'Lembrete',
        reserva: confirmada,
      },
    ]);
  });

  it('Reserva Confirmada que já teve lembrete (jaLembrou: true) não gera vencimento de Lembrete', () => {
    const confirmada = umaReserva({
      id: 11,
      status: 'Confirmada',
      inicio: em('11T14:00'),
      jaLembrou: true,
    });
    const lista = vencimentos({ reservas: [confirmada], politica: POLITICA });
    expect(lista).toEqual([]);
  });

  it('Reserva com status terminal (Expirada, Recusada, Cancelada) não gera vencimento', () => {
    const r1 = umaReserva({ id: 1, status: 'Expirada' });
    const r2 = umaReserva({ id: 2, status: 'Recusada' });
    const r3 = umaReserva({ id: 3, status: 'Cancelada' });
    const lista = vencimentos({ reservas: [r1, r2, r3], politica: POLITICA });
    expect(lista).toEqual([]);
  });

  it('ordena vencimentos cronologicamente e desempata por regra: RN12 antes de US16 (ADR 0004)', () => {
    // Pedido com início às 15h -> expira às 13h (RN12)
    const pedido = umaReserva({ id: 10, status: 'Pendente', inicio: em('11T15:00') });
    // Confirmada com início às 14h -> lembrete às 13h (US16)
    const confirmada = umaReserva({ id: 20, status: 'Confirmada', inicio: em('11T14:00') });
    // Pedido com início às 16h -> expira às 14h (RN12)
    const pedidoTarde = umaReserva({ id: 30, status: 'Pendente', inicio: em('11T16:00') });

    const lista = vencimentos({
      reservas: [pedidoTarde, confirmada, pedido],
      politica: POLITICA,
    });
    expect(lista.map((v) => ({ regra: v.regra, em: v.em, id: v.reserva.id }))).toEqual([
      { regra: 'RN12', em: em('11T13:00'), id: 10 },
      { regra: 'US16', em: em('11T13:00'), id: 20 },
      { regra: 'RN12', em: em('11T14:00'), id: 30 },
    ]);
  });

  it('usa a POLITICA padrão quando mundo.politica é omitido', () => {
    const pedido = umaReserva({ id: 10, status: 'Pendente', inicio: em('11T14:00') });
    const lista = vencimentos({ reservas: [pedido] });
    expect(lista[0]?.em).toEqual(em('11T12:00'));
  });

  it('RN21 · Ocorrências da mesma Série em recurso restrito expiram juntas no prazo da 1ª ocorrência', () => {
    const oc1 = umaReserva({
      id: 101,
      serieId: 5,
      status: 'Pendente',
      inicio: em('11T12:00'),
      fim: em('11T14:00'),
    });
    const oc2 = umaReserva({
      id: 102,
      serieId: 5,
      status: 'Pendente',
      inicio: em('18T12:00'),
      fim: em('18T14:00'),
    });

    // Testa as duas ordens para cobrir ramos de início anterior e posterior
    const lista1 = vencimentos({ reservas: [oc2, oc1], politica: POLITICA });
    const lista2 = vencimentos({ reservas: [oc1, oc2], politica: POLITICA });
    expect(lista1).toEqual(lista2);
  });
});

describe('sincronizar(mundo, agora)', () => {
  describe('RN12 · Expiração', () => {
    it('Pedido às 14h, agora às 11h59 (antes do Prazo de decisão) → nenhum efeito', () => {
      const mundo: Mundo = {
        reservas: [umaReserva({ id: 42, status: 'Pendente', inicio: em('11T14:00') })],
        politica: POLITICA,
      };
      const resultado = sincronizar(mundo, em('11T11:59'));
      expect(resultado.efeitos).toEqual([]);
      expect(resultado.mundo.reservas[0]?.status).toBe('Pendente');
    });

    it('Pedido às 14h, agora às 12h00 → vira Expirado, com efeito datado no vencimento e Notificação ao usuário', () => {
      const pedido = umaReserva({
        id: 42,
        usuarioId: ANA.id,
        status: 'Pendente',
        inicio: em('11T14:00'),
        fim: em('11T16:00'),
        recurso: { nome: 'Laboratório de Química' },
      });
      const mundo: Mundo = { reservas: [pedido], politica: POLITICA };

      // Executado às 12h30 (mesmo que rode depois, a data do efeito é 12h00 do vencimento)
      const resultado = sincronizar(mundo, em('11T12:30'));

      expect(resultado.efeitos).toEqual([
        {
          evento: 'StatusMudou',
          reservaId: 42,
          transicao: {
            de: 'Pendente',
            para: 'Expirada',
            em: em('11T12:00'),
            porId: null,
          },
        },
        {
          evento: 'NotificacaoEmitida',
          notificacao: {
            destinatarioId: ANA.id,
            tipo: 'Expiracao',
            mensagem:
              'Seu Pedido de Laboratório de Química (11/11/2026, das 14:00 às 16:00) expirou.',
            em: em('11T12:00'),
            reservaId: 42,
          },
        },
      ]);
      expect(resultado.mundo.reservas[0]?.status).toBe('Expirada');
    });

    it('Série restrita não decidida → todas as ocorrências expiram juntas no vencimento da 1ª', () => {
      const oc1 = umaReserva({
        id: 101,
        serieId: 5,
        status: 'Pendente',
        inicio: em('11T12:00'),
        fim: em('11T14:00'),
        recurso: { nome: 'Auditório' },
      });
      const oc2 = umaReserva({
        id: 102,
        serieId: 5,
        status: 'Pendente',
        inicio: em('18T12:00'),
        fim: em('18T14:00'),
        recurso: { nome: 'Auditório' },
      });
      const mundo: Mundo = { reservas: [oc1, oc2], politica: POLITICA };

      const resultado = sincronizar(mundo, em('11T10:00'));

      expect(resultado.efeitos).toEqual([
        {
          evento: 'StatusMudou',
          reservaId: 101,
          transicao: { de: 'Pendente', para: 'Expirada', em: em('11T10:00'), porId: null },
        },
        {
          evento: 'NotificacaoEmitida',
          notificacao: {
            destinatarioId: ANA.id,
            tipo: 'Expiracao',
            mensagem: 'Seu Pedido de Auditório (11/11/2026, das 12:00 às 14:00) expirou.',
            em: em('11T10:00'),
            reservaId: 101,
          },
        },
        {
          evento: 'StatusMudou',
          reservaId: 102,
          transicao: { de: 'Pendente', para: 'Expirada', em: em('11T10:00'), porId: null },
        },
        {
          evento: 'NotificacaoEmitida',
          notificacao: {
            destinatarioId: ANA.id,
            tipo: 'Expiracao',
            mensagem: 'Seu Pedido de Auditório (18/11/2026, das 12:00 às 14:00) expirou.',
            em: em('11T10:00'),
            reservaId: 102,
          },
        },
      ]);
    });
  });

  describe('US16 · Lembrete de 1h', () => {
    it('Reserva Confirmada às 14h, agora às 12h59 → nenhum efeito', () => {
      const confirmada = umaReserva({
        id: 50,
        status: 'Confirmada',
        inicio: em('11T14:00'),
        fim: em('11T16:00'),
      });
      const resultado = sincronizar({ reservas: [confirmada], politica: POLITICA }, em('11T12:59'));
      expect(resultado.efeitos).toEqual([]);
      expect(resultado.mundo.reservas[0]?.jaLembrou).toBeFalsy();
    });

    it('Reserva Confirmada às 14h, agora às 13h00 → emite Notificação de Lembrete datada no vencimento (13h)', () => {
      const confirmada = umaReserva({
        id: 50,
        usuarioId: BRUNO.id,
        status: 'Confirmada',
        inicio: em('11T14:00'),
        fim: em('11T16:00'),
        recurso: { nome: 'Sala 101' },
      });
      const resultado = sincronizar({ reservas: [confirmada], politica: POLITICA }, em('11T13:00'));

      expect(resultado.efeitos).toEqual([
        {
          evento: 'NotificacaoEmitida',
          notificacao: {
            destinatarioId: BRUNO.id,
            tipo: 'Lembrete',
            mensagem:
              'Lembrete: sua Reserva de Sala 101 (11/11/2026, das 14:00 às 16:00) começa em 1 hora.',
            em: em('11T13:00'),
            reservaId: 50,
          },
        },
      ]);
      expect(resultado.mundo.reservas[0]?.jaLembrou).toBe(true);
    });

    it('Reserva Confirmada às 14h processada às 13h25 → emite Notificação datada no vencimento (13h)', () => {
      const confirmada = umaReserva({
        id: 50,
        usuarioId: BRUNO.id,
        status: 'Confirmada',
        inicio: em('11T14:00'),
        fim: em('11T16:00'),
        recurso: { nome: 'Sala 101' },
      });
      const resultado = sincronizar({ reservas: [confirmada], politica: POLITICA }, em('11T13:25'));

      expect(resultado.efeitos[0]).toMatchObject({
        evento: 'NotificacaoEmitida',
        notificacao: {
          tipo: 'Lembrete',
          em: em('11T13:00'),
        },
      });
      expect(resultado.mundo.reservas[0]?.jaLembrou).toBe(true);
    });

    it('Lembrete processado no início ou depois (agora >= inicio) → descartado sem Notificação (US16, ADR 0004)', () => {
      const confirmada = umaReserva({
        id: 50,
        usuarioId: BRUNO.id,
        status: 'Confirmada',
        inicio: em('11T14:00'),
        fim: em('11T16:00'),
        recurso: { nome: 'Sala 101' },
      });
      // Servidor acordou às 14h00 (ou depois)
      const resultado = sincronizar({ reservas: [confirmada], politica: POLITICA }, em('11T14:00'));

      expect(resultado.efeitos).toEqual([]);
      // Marcada como lembrada para não tentar novamente
      expect(resultado.mundo.reservas[0]?.jaLembrou).toBe(true);
    });
  });

  describe('Idempotência', () => {
    it('executar sincronizar sucessivas vezes com o mesmo agora não duplica efeitos', () => {
      const pedido = umaReserva({ id: 10, status: 'Pendente', inicio: em('11T14:00') });
      const confirmada = umaReserva({ id: 20, status: 'Confirmada', inicio: em('11T14:00') });
      const mundo: Mundo = { reservas: [pedido, confirmada], politica: POLITICA };

      const primeira = sincronizar(mundo, em('11T13:10'));
      expect(primeira.efeitos.length).toBeGreaterThan(0);

      const segunda = sincronizar(primeira.mundo, em('11T13:10'));
      expect(segunda.efeitos).toEqual([]);
    });

    it('executar em instantes seguintes só processa vencimentos novos', () => {
      const pedido = umaReserva({ id: 10, status: 'Pendente', inicio: em('11T14:00') });
      const confirmada = umaReserva({ id: 20, status: 'Confirmada', inicio: em('11T14:00') });
      const mundo: Mundo = { reservas: [pedido, confirmada], politica: POLITICA };

      // Às 12h10: apenas a expiração do pedido (às 12h) venceu
      const passo1 = sincronizar(mundo, em('11T12:10'));
      expect(passo1.efeitos.map((e) => e.evento)).toEqual(['StatusMudou', 'NotificacaoEmitida']);
      expect(passo1.efeitos[0]).toMatchObject({ reservaId: 10 });

      // Às 13h10: o lembrete da confirmada (às 13h) venceu; o pedido já expirou
      const passo2 = sincronizar(passo1.mundo, em('11T13:10'));
      expect(passo2.efeitos.map((e) => e.evento)).toEqual(['NotificacaoEmitida']);
      expect(passo2.efeitos[0]).toMatchObject({
        evento: 'NotificacaoEmitida',
        notificacao: { tipo: 'Lembrete', reservaId: 20 },
      });
    });
  });
});
