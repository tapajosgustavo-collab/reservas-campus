import { describe, expect, it } from 'vitest';
import { decidirReserva, type FatosDaReserva, type PedidoDeReserva } from './reservar';

const AGORA = new Date('2026-11-09T08:00:00-03:00');
const ANA = { id: 7, perfil: 'Aluno' } as const;

/** Terça, 10/11/2026, em São Paulo. */
const em = (hora: string) => new Date(`2026-11-10T${hora}:00-03:00`);

const pedido = (inicio: string, fim: string): PedidoDeReserva => ({
  recursoId: 3,
  inicio: em(inicio),
  fim: em(fim),
});

const fatos = (dados: Partial<FatosDaReserva> = {}): FatosDaReserva => ({
  horarios: [{ diaSemana: 2, abre: 7 * 60, fecha: 23 * 60 }],
  reservasDoRecurso: [],
  ...dados,
});

describe('US08 · Reservar', () => {
  it('Recurso livre → Confirmada, nascendo com a primeira transição (de vazio)', () => {
    const comando = { ...pedido('10:00', '12:00'), participantes: 20, finalidade: 'Estudo' };

    expect(decidirReserva(fatos(), comando, ANA, AGORA)).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'ReservaCriada',
          reserva: {
            usuarioId: 7,
            recursoId: 3,
            inicio: em('10:00'),
            fim: em('12:00'),
            participantes: 20,
            finalidade: 'Estudo',
            status: 'Confirmada',
            criadaEm: AGORA,
          },
          transicao: { de: null, para: 'Confirmada', em: AGORA, porId: 7 },
        },
      ],
    });
  });
});

describe('RN01 · Sem Conflito', () => {
  const dasDezAoMeioDia = { inicio: em('10:00'), fim: em('12:00'), status: 'Confirmada' } as const;

  it('existe 10h–12h, pedir 11h–13h → recusado, dizendo o horário ocupado e não quem', () => {
    const decisao = decidirReserva(
      fatos({ reservasDoRecurso: [dasDezAoMeioDia] }),
      pedido('11:00', '13:00'),
      ANA,
      AGORA,
    );

    expect(decisao).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN01',
          nome: 'Sem Conflito',
          mensagem: 'Este Recurso já está ocupado das 10:00 às 12:00.',
          campo: 'intervalo',
        },
      ],
    });
  });

  it('existe 10h–12h, pedir 12h–14h → aceito (só se encostam)', () => {
    const decisao = decidirReserva(
      fatos({ reservasDoRecurso: [dasDezAoMeioDia] }),
      pedido('12:00', '14:00'),
      ANA,
      AGORA,
    );

    expect(decisao.tipo).toBe('aceita');
  });

  it('existe 10h–12h Cancelada, pedir 10h–12h → aceito (Reserva cancelada não ocupa)', () => {
    const decisao = decidirReserva(
      fatos({ reservasDoRecurso: [{ ...dasDezAoMeioDia, status: 'Cancelada' }] }),
      pedido('10:00', '12:00'),
      ANA,
      AGORA,
    );

    expect(decisao.tipo).toBe('aceita');
  });

  it.each(['Pendente', 'EmUso'] as const)('existe 10h–12h %s → recusado', (status) => {
    const decisao = decidirReserva(
      fatos({ reservasDoRecurso: [{ ...dasDezAoMeioDia, status }] }),
      pedido('10:00', '12:00'),
      ANA,
      AGORA,
    );

    expect(decisao.tipo).toBe('recusada');
  });

  it('pedido por cima de duas Reservas → uma violação com os dois horários', () => {
    const decisao = decidirReserva(
      fatos({
        reservasDoRecurso: [
          dasDezAoMeioDia,
          { inicio: em('14:00'), fim: em('15:00'), status: 'Confirmada' },
        ],
      }),
      pedido('11:00', '14:30'),
      ANA,
      AGORA,
    );

    expect(decisao).toMatchObject({
      violacoes: [
        { mensagem: 'Este Recurso já está ocupado das 10:00 às 12:00, das 14:00 às 15:00.' },
      ],
    });
  });
});

describe('RN02 · Intervalo válido', () => {
  it.each([
    ['10h–10h', em('10:00'), em('10:00')],
    ['12h–10h', em('12:00'), em('10:00')],
    ['10h15–11h', em('10:15'), em('11:00')],
    ['10h–10h45', em('10:00'), em('10:45')],
    ['22h–01h', em('22:00'), new Date('2026-11-11T01:00:00-03:00')],
  ])('%s → recusado', (_nome, inicio, fim) => {
    const decisao = decidirReserva(fatos(), { recursoId: 3, inicio, fim }, ANA, AGORA);

    expect(decisao).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN02',
          nome: 'Intervalo válido',
          mensagem:
            'O fim precisa ser depois do início, no mesmo dia, e as duas pontas em múltiplos de 30 minutos.',
          campo: 'intervalo',
        },
      ],
    });
  });
});

describe('RN03 · Dentro do Horário de funcionamento', () => {
  it('funcionamento 7h–23h, pedir 22h–23h30 → recusado', () => {
    expect(decidirReserva(fatos(), pedido('22:00', '23:30'), ANA, AGORA)).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN03',
          nome: 'Dentro do Horário de funcionamento',
          mensagem: 'Neste dia o Recurso funciona das 07:00 às 23:00.',
          campo: 'intervalo',
        },
      ],
    });
  });

  it('funcionamento 7h–23h, pedir 6h30–8h → recusado', () => {
    expect(decidirReserva(fatos(), pedido('06:30', '08:00'), ANA, AGORA).tipo).toBe('recusada');
  });

  it('funcionamento 7h–23h, pedir de 7h às 23h → aceito', () => {
    expect(decidirReserva(fatos(), pedido('07:00', '23:00'), ANA, AGORA).tipo).toBe('aceita');
  });

  it('dia sem Horário de funcionamento → recusado', () => {
    const domingo = fatos({ horarios: [{ diaSemana: 0, abre: 7 * 60, fecha: 23 * 60 }] });

    expect(decidirReserva(domingo, pedido('10:00', '12:00'), ANA, AGORA)).toMatchObject({
      violacoes: [{ rn: 'RN03', mensagem: 'O Recurso não abre neste dia.' }],
    });
  });

  it('funcionamento até 24h, pedir 23h–0h do dia seguinte → aceito (ainda é o mesmo dia)', () => {
    const decisao = decidirReserva(
      fatos({ horarios: [{ diaSemana: 2, abre: 7 * 60, fecha: 24 * 60 }] }),
      { recursoId: 3, inicio: em('23:00'), fim: new Date('2026-11-11T00:00:00-03:00') },
      ANA,
      AGORA,
    );

    expect(decisao.tipo).toBe('aceita');
  });

  it('o dia é o de São Paulo: terça 22h aqui, já quarta no UTC, usa o Horário de terça', () => {
    const decisao = decidirReserva(fatos(), pedido('22:00', '22:30'), ANA, AGORA);

    expect(decisao.tipo).toBe('aceita');
  });
});

describe('US08 · Todas as violações numa resposta', () => {
  it('RN01, RN02 e RN03 juntas', () => {
    const decisao = decidirReserva(
      fatos({
        reservasDoRecurso: [{ inicio: em('22:00'), fim: em('23:00'), status: 'Confirmada' }],
      }),
      pedido('22:15', '23:30'),
      ANA,
      AGORA,
    );

    expect(decisao).toMatchObject({
      violacoes: [{ rn: 'RN01' }, { rn: 'RN02' }, { rn: 'RN03' }],
    });
  });

  it('RN02 · Intervalo de duração zero dentro de uma Reserva não vira RN01 nem RN03', () => {
    const decisao = decidirReserva(
      fatos({
        reservasDoRecurso: [{ inicio: em('10:00'), fim: em('12:00'), status: 'Confirmada' }],
      }),
      pedido('11:00', '11:00'),
      ANA,
      AGORA,
    );

    expect(decisao).toMatchObject({ violacoes: [{ rn: 'RN02' }] });
    expect(decisao).not.toMatchObject({ violacoes: [{}, {}] });
  });
});
