import { describe, expect, it } from 'vitest';
import {
  sincronizar,
  vencimentos,
  type Mundo,
  type ReservaDoCiclo,
  type SuspensaoDoCiclo,
} from './sincronizar';

const ANA = { id: 7 };
const BRUNO = { id: 8 };
const CARLOS = { id: 9 };
const EDUARDO = { id: 10 };
const BIA = { id: 11 };

/** Em São Paulo. Quarta, 11/11/2026. */
const em = (diaHora: string) => new Date(`2026-11-${diaHora}:00-03:00`);

const POLITICA = {
  prazoDeDecisaoMin: 120,
  lembreteAntesDoInicioMin: 60,
  toleranciaMin: 15,
  toleranciaDeDevolucaoMin: 15,
};

type DadosDaReserva = Partial<Omit<ReservaDoCiclo, 'recurso'>> & {
  recurso?: Partial<ReservaDoCiclo['recurso']>;
};

const umaReserva = ({ recurso, ...dados }: DadosDaReserva = {}): ReservaDoCiclo => ({
  id: 42,
  usuarioId: ANA.id,
  usuario: { nome: 'Ana Souza' },
  status: 'Pendente',
  inicio: em('11T14:00'),
  fim: em('11T16:00'),
  recurso: {
    id: 1,
    nome: 'Laboratório de Química',
    tipo: 'Espaco',
    gestorId: CARLOS.id,
    ...recurso,
  },
  penalizada: false,
  ...dados,
});

/** O Notebook Dell N-01 do Carlos, como no seed da cena 6. */
const N01 = {
  id: 5,
  nome: 'Notebook Dell N-01',
  tipo: 'Equipamento',
  gestorId: CARLOS.id,
} as const;

/** Exemplo da RN23: o Eduardo com o N-01 Em uso das 10h às 12h, sem Devolução. */
const doEduardo = (dados: DadosDaReserva = {}) =>
  umaReserva({
    id: 80,
    usuarioId: EDUARDO.id,
    usuario: { nome: 'Eduardo Prado' },
    status: 'EmUso',
    inicio: em('11T10:00'),
    fim: em('11T12:00'),
    recurso: N01,
    ...dados,
  });

/** Exemplo da RN23: a Bia com o N-01 Confirmado das 12h às 14h, encostado no do Eduardo. */
const daBia = (dados: DadosDaReserva = {}) =>
  umaReserva({
    id: 81,
    usuarioId: BIA.id,
    usuario: { nome: 'Bia Costa' },
    status: 'Confirmada',
    inicio: em('11T12:00'),
    fim: em('11T14:00'),
    recurso: N01,
    ...dados,
  });

/** A Suspensão da Ana de 04/11 a 11/11, às 10h15, com o fim ainda não avisado. */
const umaSuspensao = (dados: Partial<SuspensaoDoCiclo> = {}): SuspensaoDoCiclo => ({
  id: 5,
  usuarioId: ANA.id,
  inicio: new Date('2026-11-04T10:15:00-03:00'),
  fim: em('11T10:15'),
  fimAvisado: false,
  ...dados,
});

describe('vencimentos(mundo)', () => {
  it('Pedido Pendente gera vencimento de Expiração (RN12) 2h antes do início', () => {
    const pedido = umaReserva({ id: 10, status: 'Pendente', inicio: em('11T14:00') });
    const lista = vencimentos({ reservas: [pedido], suspensoes: [], politica: POLITICA });
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
    const lista = vencimentos({ reservas: [confirmada], suspensoes: [], politica: POLITICA });
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
    const lista = vencimentos({ reservas: [r1, r2, r3], suspensoes: [], politica: POLITICA });
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
      suspensoes: [],
      politica: POLITICA,
    });
    expect(
      lista.map((v) => ({ regra: v.regra, em: v.em, id: 'reserva' in v ? v.reserva.id : null })),
    ).toEqual([
      { regra: 'RN12', em: em('11T13:00'), id: 10 },
      { regra: 'US16', em: em('11T13:00'), id: 20 },
      { regra: 'RN12', em: em('11T14:00'), id: 30 },
      { regra: 'RN15', em: em('11T14:15'), id: 20 },
    ]);
  });

  it('ADR 0004_empate no mesmo instante (12h15) segue a ordem RN17 → RN12 → RN15 → RN23 → RN18 → lembrete, não o id', () => {
    const lista = vencimentos({
      reservas: [
        // US16: Confirmada às 13h15, lembrete às 12h15.
        umaReserva({ id: 1, status: 'Confirmada', inicio: em('11T13:15'), fim: em('11T14:00') }),
        // RN18: Espaço Em uso até 12h15.
        umaReserva({ id: 2, status: 'EmUso', inicio: em('11T11:00'), fim: em('11T12:15') }),
        // RN23: a Bia no N-01 às 12h, com o do Eduardo ainda fora.
        daBia({ id: 3 }),
        // RN15: Confirmada às 12h num Espaço, sem Check-in.
        umaReserva({ id: 4, status: 'Confirmada', inicio: em('11T12:00'), fim: em('11T13:00') }),
        // RN12: Pedido às 14h15, Prazo de decisão às 12h15.
        umaReserva({ id: 5, status: 'Pendente', inicio: em('11T14:15'), fim: em('11T15:00') }),
        // RN17: o Eduardo com o N-01 até 12h, Tolerância de Devolução até 12h15.
        doEduardo({ id: 6 }),
      ],
      suspensoes: [],
      politica: POLITICA,
    });

    expect(
      lista.filter((v) => v.em.getTime() === em('11T12:15').getTime()).map((v) => v.regra),
    ).toEqual(['RN17', 'RN12', 'RN15', 'RN23', 'RN18', 'US16']);
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
    const lista1 = vencimentos({ reservas: [oc2, oc1], suspensoes: [], politica: POLITICA });
    const lista2 = vencimentos({ reservas: [oc1, oc2], suspensoes: [], politica: POLITICA });
    expect(lista1).toEqual(lista2);
  });
});

describe('sincronizar(mundo, agora)', () => {
  describe('RN12 · Expiração', () => {
    it('Pedido às 14h, agora às 11h59 (antes do Prazo de decisão) → nenhum efeito', () => {
      const mundo: Mundo = {
        reservas: [umaReserva({ id: 42, status: 'Pendente', inicio: em('11T14:00') })],
        suspensoes: [],
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
      const mundo: Mundo = { reservas: [pedido], suspensoes: [], politica: POLITICA };

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
      const mundo: Mundo = { reservas: [oc1, oc2], suspensoes: [], politica: POLITICA };

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
      const resultado = sincronizar(
        { reservas: [confirmada], suspensoes: [], politica: POLITICA },
        em('11T12:59'),
      );
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
      const resultado = sincronizar(
        { reservas: [confirmada], suspensoes: [], politica: POLITICA },
        em('11T13:00'),
      );

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
      const resultado = sincronizar(
        { reservas: [confirmada], suspensoes: [], politica: POLITICA },
        em('11T13:25'),
      );

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
      const resultado = sincronizar(
        { reservas: [confirmada], suspensoes: [], politica: POLITICA },
        em('11T14:00'),
      );

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
        { reservas: [confirmadaDaAna()], suspensoes: [], politica: POLITICA },
        em('11T14:14'),
      );
      expect(resultado.efeitos).toEqual([]);
    });

    it('RN15_Confirmada às 14h sem Check-in até 14h15 → Não comparecimento, Penalidade e Notificação datadas no fim da Tolerância', () => {
      const resultado = sincronizar(
        { reservas: [confirmadaDaAna()], suspensoes: [], politica: POLITICA },
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
        {
          evento: 'PenalidadeGerada',
          penalidade: {
            usuarioId: ANA.id,
            reservaId: 60,
            motivo: 'NaoComparecimento',
            em: em('11T14:15'),
          },
        },
      ]);
      expect(resultado.mundo.reservas[0]?.status).toBe('NaoComparecimento');
    });

    it('RN15_servidor dormindo: processado às 18h, a Penalidade continua datada às 14h15 e sai uma vez só', () => {
      const primeira = sincronizar(
        { reservas: [confirmadaDaAna()], suspensoes: [], politica: POLITICA },
        em('11T18:00'),
      );

      expect(primeira.efeitos.map((e) => e.evento)).toEqual([
        'StatusMudou',
        'NotificacaoEmitida',
        'PenalidadeGerada',
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
        { reservas: [emUso('Espaco')], suspensoes: [], politica: POLITICA },
        em('11T11:59'),
      );
      expect(resultado.efeitos).toEqual([]);
    });

    it('RN18_Espaço Em uso até 12h, processado às 15h → Concluída às 12h, sem Penalidade', () => {
      const resultado = sincronizar(
        { reservas: [emUso('Espaco')], suspensoes: [], politica: POLITICA },
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
        { reservas: [emUso('Equipamento')], suspensoes: [], politica: POLITICA },
        em('11T15:00'),
      );
      expect(resultado.efeitos.filter((e) => e.evento === 'StatusMudou')).toEqual([]);
      expect(resultado.mundo.reservas[0]?.status).toBe('EmUso');
    });
  });

  describe('RN17 · Devolução atrasada', () => {
    const penalidadeDoEduardo = {
      evento: 'PenalidadeGerada',
      penalidade: {
        usuarioId: EDUARDO.id,
        reservaId: 80,
        motivo: 'DevolucaoAtrasada',
        em: em('11T12:15'),
      },
    };
    const notificacoesDaDevolucaoAtrasada = [
      {
        evento: 'NotificacaoEmitida',
        notificacao: {
          destinatarioId: EDUARDO.id,
          tipo: 'DevolucaoAtrasada',
          mensagem:
            'Você recebeu uma Penalidade por Devolução atrasada: Notebook Dell N-01 (11/11/2026, das 10:00 às 12:00) não foi devolvido até o fim da Tolerância de Devolução, às 12:15.',
          em: em('11T12:15'),
          reservaId: 80,
        },
      },
      {
        evento: 'NotificacaoEmitida',
        notificacao: {
          destinatarioId: CARLOS.id,
          tipo: 'DevolucaoAtrasada',
          mensagem:
            'Eduardo Prado não devolveu Notebook Dell N-01 (11/11/2026, das 10:00 às 12:00) até o fim da Tolerância de Devolução, às 12:15. A Reserva continua Em uso até a Devolução.',
          em: em('11T12:15'),
          reservaId: 80,
        },
      },
    ];

    it('RN17_Equipamento Em uso até 12h sem Devolução, agora às 12h14 (dentro da Tolerância de Devolução) → nenhum efeito', () => {
      const resultado = sincronizar(
        { reservas: [doEduardo()], suspensoes: [], politica: POLITICA },
        em('11T12:14'),
      );
      expect(resultado.efeitos).toEqual([]);
    });

    it('RN17_às 12h15 sem Devolução → uma Penalidade e Notificação ao Usuário e ao Gestor responsável; a Reserva continua Em uso', () => {
      const resultado = sincronizar(
        { reservas: [doEduardo()], suspensoes: [], politica: POLITICA },
        em('11T12:15'),
      );

      expect(resultado.efeitos).toEqual([...notificacoesDaDevolucaoAtrasada, penalidadeDoEduardo]);
      expect(resultado.mundo.reservas[0]).toMatchObject({ status: 'EmUso', penalizada: true });
    });

    it('RN17_servidor dormindo: processado às 18h, a Penalidade fica datada às 12h15 e sai uma vez só', () => {
      const primeira = sincronizar(
        { reservas: [doEduardo()], suspensoes: [], politica: POLITICA },
        em('11T18:00'),
      );

      expect(primeira.efeitos).toEqual([...notificacoesDaDevolucaoAtrasada, penalidadeDoEduardo]);
      expect(sincronizar(primeira.mundo, em('11T18:00')).efeitos).toEqual([]);
      expect(sincronizar(primeira.mundo, em('12T09:00')).efeitos).toEqual([]);
    });

    it('RN17_Reserva que já tem a Penalidade (reserva_id único) não gera outra', () => {
      const resultado = sincronizar(
        { reservas: [doEduardo({ penalizada: true })], suspensoes: [], politica: POLITICA },
        em('11T18:00'),
      );
      expect(resultado.efeitos).toEqual([]);
    });

    it('RN17_a Tolerância de Devolução sai da Política: com 30 min, às 12h15 ainda não há Penalidade', () => {
      const politica = { ...POLITICA, toleranciaDeDevolucaoMin: 30 };
      expect(
        sincronizar({ reservas: [doEduardo()], suspensoes: [], politica }, em('11T12:15')).efeitos,
      ).toEqual([]);
      expect(
        sincronizar(
          { reservas: [doEduardo()], suspensoes: [], politica },
          em('11T12:30'),
        ).efeitos.map((e) => e.evento),
      ).toEqual(['NotificacaoEmitida', 'NotificacaoEmitida', 'PenalidadeGerada']);
    });

    it('RN17_Espaço Em uso não tem Devolução: conclui no fim (RN18), sem Penalidade', () => {
      const espaco = umaReserva({ status: 'EmUso', inicio: em('11T10:00'), fim: em('11T12:00') });
      const resultado = sincronizar(
        { reservas: [espaco], suspensoes: [], politica: POLITICA },
        em('11T18:00'),
      );
      expect(resultado.efeitos.map((e) => e.evento)).toEqual(['StatusMudou']);
    });
  });

  describe('RN23 · Equipamento ainda fora', () => {
    const cancelamentoDaBia = [
      {
        evento: 'StatusMudou',
        reservaId: 81,
        transicao: {
          de: 'Confirmada',
          para: 'Cancelada',
          em: em('11T12:15'),
          porId: null,
          observacao:
            'Cancelamento pelo sistema: o Equipamento não foi devolvido pela Reserva anterior até o fim da Tolerância do Check-in (RN23).',
        },
      },
      {
        evento: 'NotificacaoEmitida',
        notificacao: {
          destinatarioId: BIA.id,
          tipo: 'CancelamentoPeloSistema',
          mensagem:
            'Sua Reserva de Notebook Dell N-01 (11/11/2026, das 12:00 às 14:00) foi cancelada pelo sistema, sem Penalidade: o Equipamento não foi devolvido pela Reserva anterior até o fim da Tolerância do Check-in.',
          em: em('11T12:15'),
          reservaId: 81,
        },
      },
    ];

    it('RN23_exemplo das 12h15: Reservas que se encostam (10h–12h e 12h–14h), sem Devolução → a primeira leva a Penalidade (RN17) e a segunda é cancelada pelo sistema, sem Penalidade, no mesmo instante', () => {
      const resultado = sincronizar(
        { reservas: [daBia(), doEduardo()], suspensoes: [], politica: POLITICA },
        em('11T12:15'),
      );

      expect(resultado.efeitos.map((e) => e.evento)).toEqual([
        'NotificacaoEmitida',
        'NotificacaoEmitida',
        'PenalidadeGerada',
        'StatusMudou',
        'NotificacaoEmitida',
      ]);
      expect(resultado.efeitos[2]).toMatchObject({ penalidade: { reservaId: 80 } });
      expect(resultado.efeitos.slice(3)).toEqual(cancelamentoDaBia);
      expect(resultado.mundo.reservas.map(({ id, status }) => ({ id, status }))).toEqual([
        { id: 81, status: 'Cancelada' },
        { id: 80, status: 'EmUso' },
      ]);
    });

    it('RN23_às 12h14 a Reserva seguinte ainda espera: nenhum efeito', () => {
      const resultado = sincronizar(
        { reservas: [daBia(), doEduardo()], suspensoes: [], politica: POLITICA },
        em('11T12:14'),
      );
      expect(resultado.efeitos).toEqual([]);
    });

    it('RN23_vale mesmo sem as Reservas se encostarem: Eduardo 8h–10h sem Devolução, Bia às 12h → cancelada sem Penalidade', () => {
      const resultado = sincronizar(
        {
          reservas: [
            doEduardo({ inicio: em('11T08:00'), fim: em('11T10:00'), penalizada: true }),
            daBia(),
          ],
          suspensoes: [],
          politica: POLITICA,
        },
        em('11T12:15'),
      );
      expect(resultado.efeitos).toEqual(cancelamentoDaBia);
    });

    it('RN23_servidor dormindo: processado às 15h, o Cancelamento fica datado às 12h15 e sai uma vez só', () => {
      const primeira = sincronizar(
        {
          reservas: [doEduardo({ penalizada: true }), daBia()],
          suspensoes: [],
          politica: POLITICA,
        },
        em('11T15:00'),
      );
      expect(primeira.efeitos).toEqual(cancelamentoDaBia);
      expect(sincronizar(primeira.mundo, em('11T15:00')).efeitos).toEqual([]);
    });

    it('RN23_o Equipamento voltou antes (anterior Concluída) → a Reserva sem Check-in segue a RN15, com Penalidade', () => {
      const resultado = sincronizar(
        {
          reservas: [doEduardo({ status: 'Concluida' }), daBia()],
          suspensoes: [],
          politica: POLITICA,
        },
        em('11T12:15'),
      );
      expect(resultado.efeitos.map((e) => e.evento)).toEqual([
        'StatusMudou',
        'NotificacaoEmitida',
        'PenalidadeGerada',
      ]);
      expect(resultado.efeitos[0]).toMatchObject({
        reservaId: 81,
        transicao: { para: 'NaoComparecimento' },
      });
    });

    it('RN23_mesmo dono nas duas Reservas: o Check-in da segunda é recusado e, sem Devolução, ela é cancelada pelo sistema sem Penalidade', () => {
      // Decidido no #131: a RN23 vale ao pé da letra. O Gestor registra a Devolução da primeira e o
      // Usuário faz o Check-in da segunda de novo.
      const segundaDoEduardo = daBia({
        usuarioId: EDUARDO.id,
        usuario: { nome: 'Eduardo Prado' },
      });
      const resultado = sincronizar(
        { reservas: [doEduardo(), segundaDoEduardo], suspensoes: [], politica: POLITICA },
        em('11T12:15'),
      );

      expect(resultado.efeitos.map((e) => e.evento)).toEqual([
        'NotificacaoEmitida',
        'NotificacaoEmitida',
        'PenalidadeGerada',
        'StatusMudou',
        'NotificacaoEmitida',
      ]);
      expect(resultado.efeitos[2]).toMatchObject({ penalidade: { reservaId: 80 } });
      expect(resultado.efeitos[3]).toMatchObject({
        reservaId: 81,
        transicao: { para: 'Cancelada', porId: null },
      });
      expect(resultado.efeitos[4]).toMatchObject({
        notificacao: { destinatarioId: EDUARDO.id, tipo: 'CancelamentoPeloSistema' },
      });
    });

    it('RN23_outro Equipamento fora não segura esta Reserva: sem Check-in, segue a RN15', () => {
      const outroNotebook = { ...N01, id: 6, nome: 'Notebook Dell N-02' };
      const resultado = sincronizar(
        {
          reservas: [doEduardo({ recurso: outroNotebook, penalizada: true }), daBia()],
          suspensoes: [],
          politica: POLITICA,
        },
        em('11T12:15'),
      );
      expect(resultado.efeitos[0]).toMatchObject({
        reservaId: 81,
        transicao: { para: 'NaoComparecimento' },
      });
    });
  });

  describe('RN19 · Fim da Suspensão', () => {
    it('RN19_Suspensão até 10h15, agora às 10h14 → nenhum efeito', () => {
      const resultado = sincronizar(
        { reservas: [], suspensoes: [umaSuspensao()], politica: POLITICA },
        em('11T10:14'),
      );
      expect(resultado.efeitos).toEqual([]);
    });

    it('RN19_Suspensão até 10h15, processada às 13h → Notificação de fim datada às 10h15, uma vez só', () => {
      const resultado = sincronizar(
        { reservas: [], suspensoes: [umaSuspensao()], politica: POLITICA },
        em('11T13:00'),
      );

      expect(resultado.efeitos).toEqual([
        {
          evento: 'NotificacaoEmitida',
          notificacao: {
            destinatarioId: ANA.id,
            tipo: 'FimSuspensao',
            mensagem:
              'Sua Suspensão terminou em 11/11/2026 às 10:15. Você já pode criar Reservas de novo.',
            em: em('11T10:15'),
            suspensaoId: 5,
          },
        },
      ]);
      expect(sincronizar(resultado.mundo, em('11T13:00')).efeitos).toEqual([]);
    });

    it('RN19_fim já avisado → nenhum efeito', () => {
      const resultado = sincronizar(
        { reservas: [], suspensoes: [umaSuspensao({ fimAvisado: true })], politica: POLITICA },
        em('11T13:00'),
      );
      expect(resultado.efeitos).toEqual([]);
    });

    it('RN19_outra Suspensão cobre o fim → sem aviso no fim da primeira; o aviso sai no fim da que cobre', () => {
      const primeira = umaSuspensao({
        id: 4,
        inicio: new Date('2026-11-01T10:15:00-03:00'),
        fim: new Date('2026-11-08T10:15:00-03:00'),
      });
      const segunda = umaSuspensao({ id: 5 });

      const resultado = sincronizar(
        { reservas: [], suspensoes: [primeira, segunda], politica: POLITICA },
        em('11T13:00'),
      );

      expect(resultado.efeitos).toEqual([
        expect.objectContaining({
          notificacao: expect.objectContaining({ tipo: 'FimSuspensao', suspensaoId: 5 }),
        }),
      ]);
    });

    it('RN19_a Suspensão de outro Usuário não cobre o fim da Suspensão da Ana', () => {
      const daAna = umaSuspensao({ id: 4, fim: new Date('2026-11-08T10:15:00-03:00') });
      const doBruno = umaSuspensao({ id: 5, usuarioId: BRUNO.id, fimAvisado: true });

      const resultado = sincronizar(
        { reservas: [], suspensoes: [daAna, doBruno], politica: POLITICA },
        new Date('2026-11-08T10:15:00-03:00'),
      );

      expect(resultado.efeitos).toEqual([
        expect.objectContaining({
          notificacao: expect.objectContaining({ tipo: 'FimSuspensao', suspensaoId: 4 }),
        }),
      ]);
    });

    it('RN19_no mesmo instante, o fim da Suspensão vem depois da Conclusão (RN18) e antes do Lembrete (ADR 0004)', () => {
      const emUso = umaReserva({ id: 70, status: 'EmUso', fim: em('11T10:15') });
      const confirmada = umaReserva({ id: 71, status: 'Confirmada', inicio: em('11T11:15') });

      const lista = vencimentos({
        reservas: [confirmada, emUso],
        suspensoes: [umaSuspensao()],
        politica: POLITICA,
      });

      expect(lista.slice(0, 3).map((v) => [v.regra, v.em])).toEqual([
        ['RN18', em('11T10:15')],
        ['RN19', em('11T10:15')],
        ['US16', em('11T10:15')],
      ]);
    });
  });

  describe('Idempotência', () => {
    it('Pedido que virou Expirado não gera novos efeitos em sincronizações subsequentes', () => {
      const pedido = umaReserva({ id: 10, status: 'Pendente', inicio: em('11T14:00') });
      const mundo: Mundo = { reservas: [pedido], suspensoes: [], politica: POLITICA };

      const primeira = sincronizar(mundo, em('11T13:10'));
      expect(primeira.efeitos.length).toBe(2);

      const segunda = sincronizar(primeira.mundo, em('11T13:10'));
      expect(segunda.efeitos).toEqual([]);
    });

    it('executar em instantes seguintes com mundo atualizado mantém pedidos expirados inalterados', () => {
      const pedido = umaReserva({ id: 10, status: 'Pendente', inicio: em('11T14:00') });
      const mundo: Mundo = { reservas: [pedido], suspensoes: [], politica: POLITICA };

      const passo1 = sincronizar(mundo, em('11T12:10'));
      expect(passo1.efeitos.map((e) => e.evento)).toEqual(['StatusMudou', 'NotificacaoEmitida']);
      expect(passo1.efeitos[0]).toMatchObject({ reservaId: 10 });

      const passo2 = sincronizar(passo1.mundo, em('11T13:10'));
      expect(passo2.efeitos).toEqual([]);
    });
  });
});
