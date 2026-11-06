import { describe, expect, it } from 'vitest';
import { decidirCancelamento, type FatosDoCancelamento } from './cancelamento';

const ANA = { id: 7 };

/** Terça, 10/11/2026, em São Paulo. */
const em = (hora: string) => new Date(`2026-11-10T${hora}:00-03:00`);

/** A Reserva Confirmada da Ana às 14h. */
const fatos = (reserva: Partial<FatosDoCancelamento['reserva']> = {}): FatosDoCancelamento => ({
  reserva: { id: 42, usuarioId: ANA.id, inicio: em('14:00'), status: 'Confirmada', ...reserva },
});

describe('US13 · Cancelar', () => {
  it('a dona cancela a Reserva Confirmada antes do início → Cancelada, com a transição feita por ela', () => {
    expect(decidirCancelamento(fatos(), ANA, em('12:30'))).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 42,
          transicao: { de: 'Confirmada', para: 'Cancelada', em: em('12:30'), porId: 7 },
        },
      ],
    });
  });

  it('a dona também cancela uma Reserva Pendente antes do início → de Pendente para Cancelada', () => {
    expect(decidirCancelamento(fatos({ status: 'Pendente' }), ANA, em('12:30'))).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 42,
          transicao: { de: 'Pendente', para: 'Cancelada', em: em('12:30'), porId: 7 },
        },
      ],
    });
  });
});

describe('RN16 · Cancelamento', () => {
  it('Reserva da Ana às 14h, Bruno tenta cancelar → proibida (403): só o dono cancela', () => {
    const bruno = { id: 8 };

    // Mesmo depois do início e já encerrada, quem não é o dono só fica sabendo que não pode.
    expect(decidirCancelamento(fatos({ status: 'Concluida' }), bruno, em('15:00'))).toEqual({
      tipo: 'proibida',
      violacoes: [
        {
          rn: 'RN16',
          nome: 'Cancelamento',
          mensagem: 'Só quem fez a Reserva pode cancelá-la.',
        },
      ],
    });
  });

  it('Reserva da Ana às 14h, Ana cancela às 12h30 → aceito (antes do início)', () => {
    expect(decidirCancelamento(fatos(), ANA, em('12:30')).tipo).toBe('aceita');
  });

  it('Reserva às 14h, cancelar às 13h59 → aceito', () => {
    expect(decidirCancelamento(fatos(), ANA, em('13:59')).tipo).toBe('aceita');
  });

  it('Reserva às 14h, cancelar às 14h em ponto → recusado: o Intervalo já começou', () => {
    expect(decidirCancelamento(fatos(), ANA, em('14:00'))).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN16',
          nome: 'Cancelamento',
          mensagem: 'A Reserva só pode ser cancelada antes do início (14:00).',
        },
      ],
    });
  });

  it('Reserva às 14h, cancelar às 14h10 (depois do início) → recusado', () => {
    expect(decidirCancelamento(fatos({ status: 'Pendente' }), ANA, em('14:10'))).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN16',
          nome: 'Cancelamento',
          mensagem: 'A Reserva só pode ser cancelada antes do início (14:00).',
        },
      ],
    });
  });

  it('Reserva Em uso → recusado, mesmo antes ou depois do início, com uma violação só', () => {
    expect(decidirCancelamento(fatos({ status: 'EmUso' }), ANA, em('13:50'))).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN16',
          nome: 'Cancelamento',
          mensagem: 'Esta Reserva já está em uso e não pode mais ser cancelada.',
        },
      ],
    });
    expect(decidirCancelamento(fatos({ status: 'EmUso' }), ANA, em('14:20'))).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN16',
          nome: 'Cancelamento',
          mensagem: 'Esta Reserva já está em uso e não pode mais ser cancelada.',
        },
      ],
    });
  });

  it('Reserva já Cancelada → recusado', () => {
    expect(decidirCancelamento(fatos({ status: 'Cancelada' }), ANA, em('12:30'))).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN16',
          nome: 'Cancelamento',
          mensagem: 'Esta Reserva já foi cancelada.',
        },
      ],
    });
  });

  it.each(['Recusada', 'Expirada', 'Concluida', 'NaoComparecimento'] as const)(
    'Reserva %s → recusado: já foi encerrada',
    (status) => {
      expect(decidirCancelamento(fatos({ status }), ANA, em('15:00'))).toEqual({
        tipo: 'recusada',
        violacoes: [
          {
            rn: 'RN16',
            nome: 'Cancelamento',
            mensagem: 'Esta Reserva já foi encerrada e não pode mais ser cancelada.',
          },
        ],
      });
    },
  );
});
