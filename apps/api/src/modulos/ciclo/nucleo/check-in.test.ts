import { describe, expect, it } from 'vitest';
import { decidirCheckIn, type FatosDoCheckIn } from './check-in';

const ANA = { id: 7 };

/** Terça, 10/11/2026, em São Paulo. */
const em = (hora: string) => new Date(`2026-11-10T${hora}:00-03:00`);

/** A Reserva Confirmada da Ana às 10h, com a janela da Política: 15 min antes e 15 depois. */
const fatos = (reserva: Partial<FatosDoCheckIn['reserva']> = {}): FatosDoCheckIn => ({
  reserva: { id: 42, usuarioId: ANA.id, inicio: em('10:00'), status: 'Confirmada', ...reserva },
  politica: { checkInAntesDoInicioMin: 15, toleranciaMin: 15 },
});

describe('US12 · Fazer Check-in', () => {
  it('a dona, na janela, numa Reserva Confirmada → Em uso, com a transição feita por ela', () => {
    expect(decidirCheckIn(fatos(), ANA, em('09:50'))).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 42,
          transicao: { de: 'Confirmada', para: 'EmUso', em: em('09:50'), porId: 7 },
        },
      ],
    });
  });
});

describe('RN14 · Janela de Check-in', () => {
  it('Reserva às 10h, Check-in às 9h40 → recusado, dizendo quando abre', () => {
    expect(decidirCheckIn(fatos(), ANA, em('09:40'))).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN14',
          nome: 'Janela de Check-in',
          mensagem: 'O Check-in abre às 09:45, 15 minutos antes do início.',
        },
      ],
    });
  });

  it('Reserva às 10h, Check-in às 9h50 → aceito', () => {
    expect(decidirCheckIn(fatos(), ANA, em('09:50')).tipo).toBe('aceita');
  });

  it('Reserva às 10h, Check-in às 10h14 → aceito, ainda na Tolerância', () => {
    expect(decidirCheckIn(fatos(), ANA, em('10:14')).tipo).toBe('aceita');
  });

  it('Reserva às 10h, Check-in às 10h16 → recusado, dizendo quando a Tolerância acabou', () => {
    expect(decidirCheckIn(fatos(), ANA, em('10:16'))).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN14',
          nome: 'Janela de Check-in',
          mensagem: 'O Check-in fechou às 10:15, no fim da Tolerância de 15 minutos.',
        },
      ],
    });
  });

  it('a janela abre às 9h45 em ponto → aceito', () => {
    expect(decidirCheckIn(fatos(), ANA, em('09:45')).tipo).toBe('aceita');
  });

  it('às 10h15 em ponto a Tolerância acabou (é quando vira Não comparecimento) → recusado', () => {
    expect(decidirCheckIn(fatos(), ANA, em('10:15')).tipo).toBe('recusada');
  });

  it('a janela sai da Política: com Tolerância de 30 min, 10h20 → aceito', () => {
    const politica = { checkInAntesDoInicioMin: 15, toleranciaMin: 30 };

    expect(decidirCheckIn({ ...fatos(), politica }, ANA, em('10:20')).tipo).toBe('aceita');
  });

  it('Reserva Pendente, na janela → recusado: ainda aguarda o Gestor', () => {
    expect(decidirCheckIn(fatos({ status: 'Pendente' }), ANA, em('09:50'))).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN14',
          nome: 'Janela de Check-in',
          mensagem: 'Reserva Pendente não aceita Check-in: ela ainda aguarda a decisão do Gestor.',
        },
      ],
    });
  });

  it('Reserva Pendente às 9h40 → recusado com as duas violações, não só a primeira', () => {
    const decisao = decidirCheckIn(fatos({ status: 'Pendente' }), ANA, em('09:40'));

    expect(decisao).toMatchObject({
      tipo: 'recusada',
      violacoes: [
        { rn: 'RN14', mensagem: expect.stringContaining('Pendente') },
        { rn: 'RN14', mensagem: expect.stringContaining('abre às 09:45') },
      ],
    });
  });

  it('Check-in já feito (Em uso) → recusado, mesmo depois da Tolerância, com uma violação só', () => {
    expect(decidirCheckIn(fatos({ status: 'EmUso' }), ANA, em('10:20'))).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN14',
          nome: 'Janela de Check-in',
          mensagem: 'O Check-in desta Reserva já foi feito.',
        },
      ],
    });
  });

  it('outra pessoa → proibida (403), com a regra de dono e nada sobre a Reserva', () => {
    const bruno = { id: 8 };

    // Pendente e fora da janela: mesmo assim, quem não é o dono só fica sabendo que não pode.
    expect(decidirCheckIn(fatos({ status: 'Pendente' }), bruno, em('09:40'))).toEqual({
      tipo: 'proibida',
      violacoes: [
        {
          rn: 'RN14',
          nome: 'Janela de Check-in',
          mensagem: 'Só quem fez a Reserva pode fazer o Check-in dela.',
        },
      ],
    });
  });

  it.each(['Recusada', 'Expirada', 'Cancelada', 'Concluida', 'NaoComparecimento'] as const)(
    'Reserva %s → recusado: já foi encerrada',
    (status) => {
      expect(decidirCheckIn(fatos({ status }), ANA, em('10:20'))).toEqual({
        tipo: 'recusada',
        violacoes: [
          {
            rn: 'RN14',
            nome: 'Janela de Check-in',
            mensagem: 'Esta Reserva já foi encerrada e não aceita mais Check-in.',
          },
        ],
      });
    },
  );
});
