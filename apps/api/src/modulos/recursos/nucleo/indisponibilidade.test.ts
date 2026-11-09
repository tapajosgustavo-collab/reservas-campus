import type { Status } from '@reservas/shared';
import { describe, expect, it } from 'vitest';
import {
  decidirIndisponibilidade,
  type PedidoDeIndisponibilidade,
  type ReservaNoPeriodo,
} from './indisponibilidade';

const carlos = { id: 3, perfil: 'Gestor' } as const;
const dora = { id: 4, perfil: 'Gestor' } as const;

/** A Sala 102, cadastrada pelo Carlos. */
const sala102 = { id: 10, gestorId: carlos.id } as const;

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
    inicio: new Date('2026-11-11T10:00:00-03:00'),
    fim: new Date('2026-11-11T12:00:00-03:00'),
    status: 'Confirmada',
    ...dados,
  };
}

function decidir(reservas: ReservaNoPeriodo[], pedido = manutencao) {
  return decidirIndisponibilidade({ recurso: sala102, reservas }, pedido, carlos, agora);
}

const criada = (pedido = manutencao) => ({
  evento: 'IndisponibilidadeCriada',
  indisponibilidade: { ...pedido, recursoId: sala102.id, criadaEm: agora },
});

const cancelamento = (reservaId: number, de: Status) => ({
  evento: 'StatusMudou',
  reservaId,
  transicao: { de, para: 'Cancelada', em: agora, porId: null, observacao: CAUSA },
});

describe('RN13 · Gestor do Recurso', () => {
  it('RN13 · Carlos cadastrou a Sala 102, Dora tenta marcar Indisponibilidade → recusado', () => {
    expect(
      decidirIndisponibilidade({ recurso: sala102, reservas: [daBia()] }, manutencao, dora, agora),
    ).toEqual({
      tipo: 'recusada',
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
  it('RN04 · Sala 102 sem Reservas no período → aceita, só a Indisponibilidade', () => {
    expect(decidir([])).toEqual({ tipo: 'aceita', efeitos: [criada()] });
  });

  it('RN04 · Reserva Confirmada da Bia no período → Cancelamento pelo sistema com a causa, sem Penalidade', () => {
    expect(decidir([daBia()])).toEqual({
      tipo: 'aceita',
      efeitos: [criada(), cancelamento(50, 'Confirmada')],
    });
  });

  it('RN04 · Reserva Pendente no período → Cancelamento pelo sistema', () => {
    expect(decidir([daBia({ status: 'Pendente' })])).toEqual({
      tipo: 'aceita',
      efeitos: [criada(), cancelamento(50, 'Pendente')],
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
      efeitos: [criada(), cancelamento(50, 'Confirmada')],
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
      efeitos: [criada(semFim), cancelamento(50, 'Confirmada'), cancelamento(70, 'Confirmada')],
    });
  });
});
