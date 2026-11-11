import type { Status } from '@reservas/shared';
import { describe, expect, it } from 'vitest';
import {
  decidirIndisponibilidade,
  type PedidoDeIndisponibilidade,
  type ReservaNoPeriodo,
} from './indisponibilidade';

const carlos = { id: 3, perfil: 'Gestor' } as const;
const dora = { id: 4, perfil: 'Gestor' } as const;
const bia = { id: 8 } as const;

/** A Sala 102, cadastrada pelo Carlos. */
const sala102 = { id: 10, nome: 'Sala 102', gestorId: carlos.id } as const;

const agora = new Date('2026-11-10T08:00:00-03:00');

/** Manutenção de 10/11 8h a 12/11 18h. */
const manutencao: PedidoDeIndisponibilidade = {
  inicio: new Date('2026-11-10T08:00:00-03:00'),
  fim: new Date('2026-11-12T18:00:00-03:00'),
  motivo: 'Troca do ar-condicionado',
};

const CAUSA = 'Cancelamento pelo sistema: o Recurso ficou indisponível (Troca do ar-condicionado).';

/** Reserva da Bia na Sala 102, quarta 11/11, 10h–12h. */
function daBia(dados: Partial<ReservaNoPeriodo> = {}): ReservaNoPeriodo {
  return {
    id: 50,
    usuarioId: bia.id,
    inicio: new Date('2026-11-11T10:00:00-03:00'),
    fim: new Date('2026-11-11T12:00:00-03:00'),
    status: 'Confirmada',
    ...dados,
  };
}

function decidir(reservas: ReservaNoPeriodo[], pedido = manutencao, quando = agora) {
  return decidirIndisponibilidade({ recurso: sala102, reservas }, pedido, carlos, quando);
}

const criada = (pedido = manutencao) => ({
  evento: 'IndisponibilidadeCriada',
  indisponibilidade: { ...pedido, recursoId: sala102.id, criadaEm: agora },
});

/** O Cancelamento pelo sistema de todas as Reservas de uma vez, com o Status de antes de cada uma. */
const canceladas = (...reservas: { id: number; de: Status }[]) => ({
  evento: 'ReservasCanceladasPeloSistema',
  reservas,
  em: agora,
  observacao: CAUSA,
});

const notificada = (
  reservaId = 50,
  intervalo = '11/11/2026, das 10:00 às 12:00',
  destinatarioId: number = bia.id,
) => ({
  evento: 'NotificacaoEmitida',
  notificacao: {
    destinatarioId,
    tipo: 'CancelamentoPeloSistema',
    mensagem: `Sua Reserva de Sala 102 (${intervalo}) foi cancelada pelo sistema: o Recurso ficou indisponível (Troca do ar-condicionado).`,
    em: agora,
    reservaId,
  },
});

describe('RN13 · Gestor do Recurso', () => {
  it('RN13 · Carlos cadastrou a Sala 102, Dora tenta marcar Indisponibilidade → proibido', () => {
    expect(
      decidirIndisponibilidade({ recurso: sala102, reservas: [daBia()] }, manutencao, dora, agora),
    ).toEqual({
      tipo: 'proibida',
      violacoes: [
        {
          rn: 'RN13',
          nome: 'Gestor do Recurso',
          mensagem: 'Só o Gestor responsável por este Recurso pode marcá-lo como indisponível.',
        },
      ],
    });
  });
});

describe('RN04 · Indisponibilidade', () => {
  it('RN04 · são 8h e a Indisponibilidade começa às 7h30 → recusado, nada é cancelado', () => {
    const noPassado = { ...manutencao, inicio: new Date('2026-11-10T07:30:00-03:00') };

    expect(decidir([daBia()], noPassado)).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN04',
          nome: 'Indisponibilidade',
          mensagem:
            'A Indisponibilidade não pode começar no passado: o primeiro horário possível é 08:00.',
        },
      ],
    });
  });

  it('RN04 · são 8h10 e a Indisponibilidade começa às 8h → recusado, o primeiro horário é 08:30', () => {
    expect(decidir([], manutencao, new Date('2026-11-10T08:10:00-03:00'))).toMatchObject({
      tipo: 'recusada',
      violacoes: [{ rn: 'RN04', mensagem: expect.stringContaining('é 08:30.') }],
    });
  });

  it('RN04 · Indisponibilidade começando agora → aceita', () => {
    expect(decidir([])).toMatchObject({ tipo: 'aceita' });
  });

  it('RN04 · Sala 102 sem Reservas no período → aceita, só a Indisponibilidade', () => {
    expect(decidir([])).toEqual({ tipo: 'aceita', efeitos: [criada()] });
  });

  it('RN04 · Reserva Confirmada da Bia no período → Cancelamento pelo sistema com a causa e Notificação, sem Penalidade (US16)', () => {
    expect(decidir([daBia()])).toEqual({
      tipo: 'aceita',
      efeitos: [criada(), canceladas({ id: 50, de: 'Confirmada' }), notificada()],
    });
  });

  it('RN04 · Reserva Pendente no período → Cancelamento pelo sistema e Notificação', () => {
    expect(decidir([daBia({ status: 'Pendente' })])).toEqual({
      tipo: 'aceita',
      efeitos: [criada(), canceladas({ id: 50, de: 'Pendente' }), notificada()],
    });
  });

  it('RN04 · Reserva Em uso no período → continua, sem Cancelamento', () => {
    expect(decidir([daBia({ status: 'EmUso' })])).toEqual({
      tipo: 'aceita',
      efeitos: [criada()],
    });
  });

  it('RN04 · Reservas já encerradas no período não mudam', () => {
    const encerradas: Status[] = ['Cancelada', 'Concluida', 'NaoComparecimento', 'Recusada'];
    expect(decidir(encerradas.map((status, i) => daBia({ id: 60 + i, status })))).toEqual({
      tipo: 'aceita',
      efeitos: [criada()],
    });
  });

  it('RN04 · Reserva que termina no início ou começa no fim da Indisponibilidade não muda', () => {
    const antes = daBia({
      id: 51,
      inicio: new Date('2026-11-10T06:00:00-03:00'),
      fim: new Date('2026-11-10T08:00:00-03:00'),
    });
    const depois = daBia({
      id: 52,
      inicio: new Date('2026-11-12T18:00:00-03:00'),
      fim: new Date('2026-11-12T20:00:00-03:00'),
    });
    expect(decidir([antes, depois])).toEqual({ tipo: 'aceita', efeitos: [criada()] });
  });

  it('RN04 · Reserva que atravessa o início da Indisponibilidade → Cancelamento pelo sistema', () => {
    const atravessa = daBia({
      inicio: new Date('2026-11-12T17:00:00-03:00'),
      fim: new Date('2026-11-12T19:00:00-03:00'),
    });
    expect(decidir([atravessa])).toEqual({
      tipo: 'aceita',
      efeitos: [
        criada(),
        canceladas({ id: 50, de: 'Confirmada' }),
        notificada(50, '12/11/2026, das 17:00 às 19:00'),
      ],
    });
  });

  it('RN04 · tirar de uso: Indisponibilidade sem fim cancela as Reservas de qualquer data depois do início', () => {
    const semFim = { ...manutencao, fim: null };
    const noAnoQueVem = daBia({
      id: 70,
      inicio: new Date('2027-03-01T10:00:00-03:00'),
      fim: new Date('2027-03-01T12:00:00-03:00'),
    });
    expect(decidir([daBia(), noAnoQueVem], semFim)).toEqual({
      tipo: 'aceita',
      efeitos: [
        criada(semFim),
        canceladas({ id: 50, de: 'Confirmada' }, { id: 70, de: 'Confirmada' }),
        notificada(50, '11/11/2026, das 10:00 às 12:00'),
        notificada(70, '01/03/2027, das 10:00 às 12:00'),
      ],
    });
  });
});
