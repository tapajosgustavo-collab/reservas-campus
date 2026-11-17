import { describe, expect, it } from 'vitest';
import { sincronizar, vencimentos, type Mundo, type ReservaDoCiclo } from './sincronizar';

const ANA = { id: 7 };
const BRUNO = { id: 8 };

/** Em São Paulo. Quarta, 11/11/2026. */
const em = (diaHora: string) => new Date(`2026-11-${diaHora}:00-03:00`);

const POLITICA = {
  prazoDeDecisaoMin: 120,
  lembreteAntesDoInicioMin: 60,
  toleranciaMin: 15,
};

const umaReserva = (dados: Partial<ReservaDoCiclo> = {}): ReservaDoCiclo => ({
  id: 42,
  usuarioId: ANA.id,
  status: 'Pendente',
  inicio: em('11T14:00'),
  fim: em('11T16:00'),
  recurso: { nome: 'Laboratório de Química', tipo: 'Espaco' },
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

  it('RN15_Reserva Confirmada gera Lembrete (US16) 1h antes do início e Não comparecimento no fim da Tolerância', () => {
    const confirmada = umaReserva({ id: 11, status: 'Confirmada', inicio: em('11T14:00') });
    const lista = vencimentos({ reservas: [confirmada], politica: POLITICA });
    expect(lista).toEqual([
      {
        em: em('11T13:00'),
        regra: 'US16',
        tipo: 'Lembrete',
        reserva: confirmada,
      },
      {
        em: em('11T14:15'),
        regra: 'RN15',
        tipo: 'NaoComparecimento',
        reserva: confirmada,
      },
    ]);
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
      { regra: 'RN15', em: em('11T14:15'), id: 20 },
    ]);
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
        recurso: { nome: 'Laboratório de Química', tipo: 'Espaco' },
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

    it('Série restrita não decidida → todas as ocorrências expiram juntas, emitindo 1 única Notificação para a Série (RN21)', () => {
      const oc1 = umaReserva({
        id: 101,
        serieId: 5,
        status: 'Pendente',
        inicio: em('11T12:00'),
        fim: em('11T14:00'),
        recurso: { nome: 'Auditório', tipo: 'Espaco' },
      });
      const oc2 = umaReserva({
        id: 102,
        serieId: 5,
        status: 'Pendente',
        inicio: em('18T12:00'),
        fim: em('18T14:00'),
        recurso: { nome: 'Auditório', tipo: 'Espaco' },
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
            mensagem: 'Seu Pedido em Série de Auditório expirou.',
            em: em('11T10:00'),
            reservaId: 101,
          },
        },
        {
          evento: 'StatusMudou',
          reservaId: 102,
          transicao: { de: 'Pendente', para: 'Expirada', em: em('11T10:00'), porId: null },
        },
      ]);
      expect(resultado.mundo.reservas.map((r) => r.status)).toEqual(['Expirada', 'Expirada']);
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
    });

    it('Reserva Confirmada às 14h, agora às 13h00 → emite Notificação de Lembrete com horário dinâmico (começa às 14:00)', () => {
      const confirmada = umaReserva({
        id: 50,
        usuarioId: BRUNO.id,
        status: 'Confirmada',
        inicio: em('11T14:00'),
        fim: em('11T16:00'),
        recurso: { nome: 'Sala 101', tipo: 'Espaco' },
      });
      const resultado = sincronizar({ reservas: [confirmada], politica: POLITICA }, em('11T13:00'));

      expect(resultado.efeitos).toEqual([
        {
          evento: 'NotificacaoEmitida',
          notificacao: {
            destinatarioId: BRUNO.id,
            tipo: 'Lembrete',
            mensagem:
              'Lembrete: sua Reserva de Sala 101 (11/11/2026, das 14:00 às 16:00) começa às 14:00.',
            em: em('11T13:00'),
            reservaId: 50,
          },
        },
      ]);
    });

    it('Reserva Confirmada às 14h processada às 13h25 → emite Notificação datada no vencimento (13h)', () => {
      const confirmada = umaReserva({
        id: 50,
        usuarioId: BRUNO.id,
        status: 'Confirmada',
        inicio: em('11T14:00'),
        fim: em('11T16:00'),
        recurso: { nome: 'Sala 101', tipo: 'Espaco' },
      });
      const resultado = sincronizar({ reservas: [confirmada], politica: POLITICA }, em('11T13:25'));

      expect(resultado.efeitos[0]).toMatchObject({
        evento: 'NotificacaoEmitida',
        notificacao: {
          tipo: 'Lembrete',
          mensagem:
            'Lembrete: sua Reserva de Sala 101 (11/11/2026, das 14:00 às 16:00) começa às 14:00.',
          em: em('11T13:00'),
        },
      });
    });

    it('Lembrete processado no início ou depois (agora >= inicio) → descartado sem Notificação (US16, ADR 0004)', () => {
      const confirmada = umaReserva({
        id: 50,
        usuarioId: BRUNO.id,
        status: 'Confirmada',
        inicio: em('11T14:00'),
        fim: em('11T16:00'),
        recurso: { nome: 'Sala 101', tipo: 'Espaco' },
      });
      // Servidor acordou às 14h00 (ou depois)
      const resultado = sincronizar({ reservas: [confirmada], politica: POLITICA }, em('11T14:00'));

      expect(resultado.efeitos).toEqual([]);
    });
  });

  describe('RN15 · Não comparecimento', () => {
    const confirmadaDaAna = () =>
      umaReserva({
        id: 60,
        usuarioId: ANA.id,
        status: 'Confirmada',
        inicio: em('11T14:00'),
        fim: em('11T16:00'),
        recurso: { nome: 'Sala 101', tipo: 'Espaco' },
      });

    it('RN15_Confirmada às 14h sem Check-in, agora às 14h14 (dentro da Tolerância) → nenhum efeito', () => {
      const resultado = sincronizar(
        { reservas: [confirmadaDaAna()], politica: POLITICA },
        em('11T14:14'),
      );
      expect(resultado.efeitos).toEqual([]);
    });

    it('RN15_Confirmada às 14h sem Check-in até 14h15 → Não comparecimento, Penalidade e Notificação datadas no fim da Tolerância', () => {
      const resultado = sincronizar(
        { reservas: [confirmadaDaAna()], politica: POLITICA },
        em('11T14:15'),
      );

      expect(resultado.efeitos).toEqual([
        {
          evento: 'StatusMudou',
          reservaId: 60,
          transicao: {
            de: 'Confirmada',
            para: 'NaoComparecimento',
            em: em('11T14:15'),
            porId: null,
          },
        },
        {
          evento: 'PenalidadeGerada',
          penalidade: {
            usuarioId: ANA.id,
            reservaId: 60,
            motivo: 'NaoComparecimento',
            em: em('11T14:15'),
          },
        },
        {
          evento: 'NotificacaoEmitida',
          notificacao: {
            destinatarioId: ANA.id,
            tipo: 'Penalidade',
            mensagem:
              'Você recebeu uma Penalidade por Não comparecimento na Reserva de Sala 101 (11/11/2026, das 14:00 às 16:00).',
            em: em('11T14:15'),
            reservaId: 60,
          },
        },
      ]);
      expect(resultado.mundo.reservas[0]?.status).toBe('NaoComparecimento');
    });

    it('RN15_servidor dormindo: processado às 18h, a Penalidade continua datada às 14h15 e sai uma vez só', () => {
      const primeira = sincronizar(
        { reservas: [confirmadaDaAna()], politica: POLITICA },
        em('11T18:00'),
      );

      expect(primeira.efeitos.map((e) => e.evento)).toEqual([
        'StatusMudou',
        'PenalidadeGerada',
        'NotificacaoEmitida',
      ]);
      expect(primeira.efeitos).toContainEqual(
        expect.objectContaining({
          evento: 'PenalidadeGerada',
          penalidade: expect.objectContaining({ em: em('11T14:15') }),
        }),
      );
      expect(sincronizar(primeira.mundo, em('11T18:00')).efeitos).toEqual([]);
    });
  });

  describe('RN18 · Conclusão automática', () => {
    const emUso = (tipo: 'Espaco' | 'Equipamento') =>
      umaReserva({
        id: 70,
        status: 'EmUso',
        inicio: em('11T10:00'),
        fim: em('11T12:00'),
        recurso: { nome: tipo === 'Espaco' ? 'Sala 101' : 'Notebook Dell N-01', tipo },
      });

    it('RN18_Espaço Em uso até 12h, agora às 11h59 → nenhum efeito', () => {
      const resultado = sincronizar(
        { reservas: [emUso('Espaco')], politica: POLITICA },
        em('11T11:59'),
      );
      expect(resultado.efeitos).toEqual([]);
    });

    it('RN18_Espaço Em uso até 12h, processado às 15h → Concluída às 12h, sem Penalidade', () => {
      const resultado = sincronizar(
        { reservas: [emUso('Espaco')], politica: POLITICA },
        em('11T15:00'),
      );
      expect(resultado.efeitos).toEqual([
        {
          evento: 'StatusMudou',
          reservaId: 70,
          transicao: { de: 'EmUso', para: 'Concluida', em: em('11T12:00'), porId: null },
        },
      ]);
      expect(resultado.mundo.reservas[0]?.status).toBe('Concluida');
    });

    it('RN18_Equipamento Em uso não conclui sozinho: só termina com a Devolução (RN17)', () => {
      const resultado = sincronizar(
        { reservas: [emUso('Equipamento')], politica: POLITICA },
        em('11T15:00'),
      );
      expect(resultado.efeitos).toEqual([]);
    });
  });

  describe('Idempotência', () => {
    it('Pedido que virou Expirado não gera novos efeitos em sincronizações subsequentes', () => {
      const pedido = umaReserva({ id: 10, status: 'Pendente', inicio: em('11T14:00') });
      const mundo: Mundo = { reservas: [pedido], politica: POLITICA };

      const primeira = sincronizar(mundo, em('11T13:10'));
      expect(primeira.efeitos.length).toBe(2);

      const segunda = sincronizar(primeira.mundo, em('11T13:10'));
      expect(segunda.efeitos).toEqual([]);
    });

    it('executar em instantes seguintes com mundo atualizado mantém pedidos expirados inalterados', () => {
      const pedido = umaReserva({ id: 10, status: 'Pendente', inicio: em('11T14:00') });
      const mundo: Mundo = { reservas: [pedido], politica: POLITICA };

      const passo1 = sincronizar(mundo, em('11T12:10'));
      expect(passo1.efeitos.map((e) => e.evento)).toEqual(['StatusMudou', 'NotificacaoEmitida']);
      expect(passo1.efeitos[0]).toMatchObject({ reservaId: 10 });

      const passo2 = sincronizar(passo1.mundo, em('11T13:10'));
      expect(passo2.efeitos).toEqual([]);
    });
  });
});
