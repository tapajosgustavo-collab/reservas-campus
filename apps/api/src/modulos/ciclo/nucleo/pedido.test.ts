import { describe, expect, it } from 'vitest';
import { decidirAprovacao, decidirRecusa, type FatosDoPedido } from './pedido';

const CARLOS = { id: 3 };
const DORA = { id: 4 };

/** Em São Paulo. A Reserva padrão é na quarta, 11/11/2026, das 14h às 16h. */
const em = (diaHora: string) => new Date(`2026-11-${diaHora}:00-03:00`);

const POLITICA = { prazoDeDecisaoMin: 120 };

/** O Pedido da Ana no laboratório restrito, cadastrado pelo Carlos. */
const fatos = (
  reserva: Partial<Omit<FatosDoPedido['reserva'], 'recurso'>> = {},
): FatosDoPedido => ({
  reserva: {
    id: 42,
    status: 'Pendente',
    inicio: em('11T14:00'),
    ...reserva,
    recurso: { gestorId: CARLOS.id },
  },
  politica: POLITICA,
});

describe('US11 · Decidir Pedidos', () => {
  it('o Gestor responsável aprova o Pedido Pendente → Confirmada, com a transição feita por ele', () => {
    expect(decidirAprovacao(fatos(), CARLOS, em('10T09:00'))).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 42,
          transicao: { de: 'Pendente', para: 'Confirmada', em: em('10T09:00'), porId: CARLOS.id },
        },
      ],
    });
  });

  it('o Gestor responsável recusa o Pedido com justificativa → Recusada, com a justificativa na transição', () => {
    const recusa = { justificativa: '  Laboratório reservado para a banca de TCC.  ' };
    expect(decidirRecusa(fatos(), recusa, CARLOS, em('10T09:00'))).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 42,
          transicao: {
            de: 'Pendente',
            para: 'Recusada',
            em: em('10T09:00'),
            porId: CARLOS.id,
            observacao: 'Laboratório reservado para a banca de TCC.',
          },
        },
      ],
    });
  });
});

describe('RN10 · Restrito começa Pendente', () => {
  it.each([
    ['Confirmada', 'Esta Reserva já está Confirmada.'],
    ['Recusada', 'Este Pedido já foi recusado.'],
    ['Cancelada', 'Este Pedido já foi cancelado.'],
    ['EmUso', 'Esta Reserva não aguarda decisão.'],
    ['Concluida', 'Esta Reserva não aguarda decisão.'],
    ['NaoComparecimento', 'Esta Reserva não aguarda decisão.'],
  ] as const)('Reserva %s → recusado: só o Pedido Pendente é decidido', (status, mensagem) => {
    expect(decidirAprovacao(fatos({ status }), CARLOS, em('10T09:00'))).toEqual({
      tipo: 'recusada',
      violacoes: [{ rn: 'RN10', nome: 'Restrito começa Pendente', mensagem }],
    });
  });
});

describe('RN11 · Recusa justificada', () => {
  it.each(['', '   '])(
    'Recusa com justificativa "%s" → recusado, pedindo a justificativa',
    (texto) => {
      expect(decidirRecusa(fatos(), { justificativa: texto }, CARLOS, em('10T09:00'))).toEqual({
        tipo: 'recusada',
        violacoes: [
          {
            rn: 'RN11',
            nome: 'Recusa justificada',
            mensagem: 'Escreva a justificativa da Recusa: ela vai na Notificação ao Usuário.',
            campo: 'justificativa',
          },
        ],
      });
    },
  );

  it('sem justificativa e depois do Prazo de decisão → recusado com as duas regras', () => {
    expect(decidirRecusa(fatos(), { justificativa: '' }, CARLOS, em('11T12:30'))).toMatchObject({
      tipo: 'recusada',
      violacoes: [{ rn: 'RN12' }, { rn: 'RN11' }],
    });
  });
});

describe('RN12 · Expiração', () => {
  it('Pedido às 14h, Aprovação às 11h59 (antes do Prazo de decisão) → aceito', () => {
    expect(decidirAprovacao(fatos(), CARLOS, em('11T11:59')).tipo).toBe('aceita');
  });

  it('Pedido às 14h, Aprovação às 12h00 (2h antes do início) → recusado: o Pedido expirou', () => {
    expect(decidirAprovacao(fatos(), CARLOS, em('11T12:00'))).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN12',
          nome: 'Expiração',
          mensagem: 'O Prazo de decisão deste Pedido terminou às 12:00: ele expirou.',
        },
      ],
    });
  });

  it('o Prazo de decisão sai da Política: com 4h, Aprovação às 10h00 de um Pedido às 14h → recusado', () => {
    const comQuatroHoras = { ...fatos(), politica: { prazoDeDecisaoMin: 240 } };
    expect(decidirAprovacao(comQuatroHoras, CARLOS, em('11T10:00'))).toMatchObject({
      tipo: 'recusada',
      violacoes: [{ rn: 'RN12' }],
    });
  });

  it('Pedido já Expirado → recusado citando a Expiração', () => {
    expect(decidirAprovacao(fatos({ status: 'Expirada' }), CARLOS, em('10T09:00'))).toEqual({
      tipo: 'recusada',
      violacoes: [{ rn: 'RN12', nome: 'Expiração', mensagem: 'Este Pedido já expirou.' }],
    });
  });
});

describe('RN13 · Gestor do Recurso', () => {
  it('Carlos cadastra o laboratório, Dora tenta aprovar um Pedido dele → proibida (403)', () => {
    // Mesmo que o Pedido já tenha expirado, outro Gestor só recebe o 403.
    expect(decidirAprovacao(fatos({ status: 'Expirada' }), DORA, em('10T09:00'))).toEqual({
      tipo: 'proibida',
      violacoes: [
        {
          rn: 'RN13',
          nome: 'Gestor do Recurso',
          mensagem: 'Só o Gestor responsável por este Recurso pode decidir os Pedidos dele.',
        },
      ],
    });
  });

  it('Dora tenta recusar um Pedido do laboratório do Carlos, mesmo sem justificativa → proibida (403)', () => {
    expect(decidirRecusa(fatos(), { justificativa: '' }, DORA, em('10T09:00'))).toMatchObject({
      tipo: 'proibida',
      violacoes: [{ rn: 'RN13' }],
    });
  });

  it('Carlos decide os Pedidos do laboratório que ele cadastrou → aceito', () => {
    expect(decidirAprovacao(fatos(), CARLOS, em('10T09:00')).tipo).toBe('aceita');
    expect(
      decidirRecusa(fatos(), { justificativa: 'Sem técnico.' }, CARLOS, em('10T09:00')).tipo,
    ).toBe('aceita');
  });
});
