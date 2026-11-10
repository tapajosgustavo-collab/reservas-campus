import type { Recurso } from '@reservas/shared';
import { describe, expect, it } from 'vitest';
import { agendaPara, type ReservaNaAgenda } from './agenda';
import type { Quem } from './recurso';

const ana = { id: 1, perfil: 'Aluno' } as const;
const bruno = { id: 2, perfil: 'Aluno' } as const;

const lab: Recurso = {
  id: 10,
  tipo: 'Espaco',
  nome: 'Laboratório 3',
  local: 'Bloco A',
  capacidade: 30,
  patrimonio: null,
  restrito: false,
  gestor: { id: 3, nome: 'Carlos' },
  horarios: [{ diaSemana: 2, abre: 7 * 60, fecha: 23 * 60 }],
};

const agora = new Date('2026-11-10T08:00:00-03:00');

/** Reserva do Bruno no Laboratório 3, terça 10/11, 10h–12h. */
function doBruno(dados: Partial<ReservaNaAgenda> = {}): ReservaNaAgenda {
  return {
    id: 50,
    usuarioId: bruno.id,
    inicio: new Date('2026-11-10T10:00:00-03:00'),
    fim: new Date('2026-11-10T12:00:00-03:00'),
    status: 'Confirmada',
    ...dados,
  };
}

function agenda(reservas: ReservaNaAgenda[], quem: Quem = ana) {
  return agendaPara(quem, { agora, recurso: lab, indisponibilidades: [], reservas });
}

describe('RN22 · Agenda sem nomes', () => {
  it('RN22 · Bruno reservou 10h–12h, Ana vê só o início e o fim', () => {
    expect(agenda([doBruno()]).ocupacoes).toEqual([
      {
        inicio: new Date('2026-11-10T10:00:00-03:00'),
        fim: new Date('2026-11-10T12:00:00-03:00'),
      },
    ]);
  });

  it('RN22 · Bruno vê a própria Reserva com minha, reservaId e status', () => {
    expect(agenda([doBruno()], bruno).ocupacoes).toEqual([
      {
        inicio: new Date('2026-11-10T10:00:00-03:00'),
        fim: new Date('2026-11-10T12:00:00-03:00'),
        minha: true,
        reservaId: 50,
        status: 'Confirmada',
      },
    ]);
  });

  it('RN22 · Pedido Pendente do Bruno aparece para a Ana só como ocupado, sem o Status', () => {
    expect(agenda([doBruno({ status: 'Pendente' })]).ocupacoes).toEqual([
      {
        inicio: new Date('2026-11-10T10:00:00-03:00'),
        fim: new Date('2026-11-10T12:00:00-03:00'),
      },
    ]);
  });

  it('RN22 · Dora, Gestora de outro Recurso, vê só o início e o fim', () => {
    const dora = { id: 4, perfil: 'Gestor' } as const;

    expect(agenda([doBruno()], dora).ocupacoes).toEqual([
      {
        inicio: new Date('2026-11-10T10:00:00-03:00'),
        fim: new Date('2026-11-10T12:00:00-03:00'),
      },
    ]);
  });
});

describe('US07 · Agenda do Recurso', () => {
  it.each(['Recusada', 'Expirada', 'Cancelada', 'Concluida', 'NaoComparecimento'] as const)(
    'Reserva %s não ocupa a agenda',
    (status) => {
      expect(agenda([doBruno({ status })]).ocupacoes).toEqual([]);
    },
  );

  it.each(['Pendente', 'EmUso'] as const)('Reserva %s ocupa, e o dono vê o Status', (status) => {
    expect(agenda([doBruno({ status })], bruno).ocupacoes).toEqual([
      expect.objectContaining({ minha: true, status }),
    ]);
  });

  it('a agenda traz o agora, o Recurso e as Indisponibilidades como vieram', () => {
    const manutencao = {
      inicio: new Date('2026-11-12T00:00:00-03:00'),
      fim: null,
      motivo: 'Manutenção',
    };

    expect(
      agendaPara(ana, { agora, recurso: lab, indisponibilidades: [manutencao], reservas: [] }),
    ).toEqual({ agora, recurso: lab, indisponibilidades: [manutencao], ocupacoes: [] });
  });
});
