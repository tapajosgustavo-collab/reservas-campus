import { describe, expect, it } from 'vitest';
import {
  decidirAprovacao,
  decidirAprovacaoDaSerie,
  decidirRecusa,
  decidirRecusaDaSerie,
  filaDoGestor,
  type FatosDaSerie,
  type FatosDoPedido,
} from './pedido';

const CARLOS = { id: 3 };
const DORA = { id: 4 };
const ANA = { id: 7 };

/** Em São Paulo. A Reserva padrão é na quarta, 11/11/2026, das 14h às 16h. */
const em = (diaHora: string) => new Date(`2026-11-${diaHora}:00-03:00`);

const POLITICA = { prazoDeDecisaoMin: 120 };

/** O Pedido da Ana no laboratório restrito, cadastrado pelo Carlos. */
const fatos = (
  reserva: Partial<Omit<FatosDoPedido['reserva'], 'recurso'>> = {},
): FatosDoPedido => ({
  reserva: {
    id: 42,
    usuarioId: ANA.id,
    serieId: null,
    status: 'Pendente',
    inicio: em('11T14:00'),
    fim: em('11T16:00'),
    ...reserva,
    recurso: { nome: 'Laboratório de Química', gestorId: CARLOS.id },
  },
  politica: POLITICA,
});

describe('US11 · Decidir Pedidos', () => {
  it('o Gestor responsável aprova o Pedido Pendente → Confirmada, com a transição feita por ele e Notificação ao solicitante (US16)', () => {
    expect(decidirAprovacao(fatos(), CARLOS, em('10T09:00'))).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 42,
          transicao: { de: 'Pendente', para: 'Confirmada', em: em('10T09:00'), porId: CARLOS.id },
        },
        {
          evento: 'NotificacaoEmitida',
          notificacao: {
            destinatarioId: ANA.id,
            tipo: 'Aprovacao',
            mensagem:
              'Seu Pedido de Laboratório de Química (11/11/2026, das 14:00 às 16:00) foi aprovado.',
            em: em('10T09:00'),
            reservaId: 42,
          },
        },
      ],
    });
  });

  it('o Gestor responsável recusa o Pedido com justificativa → Recusada, com a justificativa na transição e na Notificação (US16)', () => {
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
        {
          evento: 'NotificacaoEmitida',
          notificacao: {
            destinatarioId: ANA.id,
            tipo: 'Recusa',
            mensagem:
              'Seu Pedido de Laboratório de Química (11/11/2026, das 14:00 às 16:00) foi recusado: Laboratório reservado para a banca de TCC.',
            em: em('10T09:00'),
            reservaId: 42,
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

  it('RN11 · a justificativa vai na Notificação ao solicitante, sempre com ponto final', () => {
    const recusa = { justificativa: 'Laboratório reservado para manutenção' };
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
            observacao: 'Laboratório reservado para manutenção',
          },
        },
        {
          evento: 'NotificacaoEmitida',
          notificacao: {
            destinatarioId: ANA.id,
            tipo: 'Recusa',
            mensagem:
              'Seu Pedido de Laboratório de Química (11/11/2026, das 14:00 às 16:00) foi recusado: Laboratório reservado para manutenção.',
            em: em('10T09:00'),
            reservaId: 42,
          },
        },
      ],
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

const EDUARDO = { id: 9 };

/**
 * A Série do Eduardo no laboratório restrito do Carlos: três Ocorrências Pendentes, às quartas
 * 11/11, 18/11 e 25/11, das 14h às 16h. O Prazo de decisão da primeira é 11/11 às 12h.
 */
const fatosDaSerie = (
  ocorrencias: FatosDaSerie['serie']['ocorrencias'] = [
    { id: 51, status: 'Pendente', inicio: em('11T14:00'), fim: em('11T16:00') },
    { id: 52, status: 'Pendente', inicio: em('18T14:00'), fim: em('18T16:00') },
    { id: 53, status: 'Pendente', inicio: em('25T14:00'), fim: em('25T16:00') },
  ],
): FatosDaSerie => ({
  serie: {
    id: 5,
    usuarioId: EDUARDO.id,
    recurso: { nome: 'Laboratório de Química', gestorId: CARLOS.id },
    ocorrencias,
  },
  politica: POLITICA,
});

const com = (status: 'Confirmada' | 'Expirada') =>
  fatosDaSerie().serie.ocorrencias.map((ocorrencia) => ({ ...ocorrencia, status }));

describe('RN21 · Série tudo-ou-nada na fila', () => {
  it('RN21 · a Série aparece como um item só, com as Ocorrências Pendentes, e a Reserva avulsa como antes, pelo início da primeira', () => {
    const avulsa = { id: 40, serieId: null, inicio: em('12T08:00'), fim: em('12T10:00') };
    const daSerie = [
      { id: 53, serieId: 5, inicio: em('25T14:00'), fim: em('25T16:00') },
      { id: 51, serieId: 5, inicio: em('11T14:00'), fim: em('11T16:00') },
      { id: 52, serieId: 5, inicio: em('18T14:00'), fim: em('18T16:00') },
    ];

    expect(filaDoGestor([avulsa, ...daSerie], POLITICA)).toEqual([
      {
        id: 51,
        serieId: 5,
        inicio: em('11T14:00'),
        fim: em('11T16:00'),
        expiraEm: em('11T12:00'),
        reservas: [
          { id: 51, inicio: em('11T14:00'), fim: em('11T16:00') },
          { id: 52, inicio: em('18T14:00'), fim: em('18T16:00') },
          { id: 53, inicio: em('25T14:00'), fim: em('25T16:00') },
        ],
      },
      {
        id: 40,
        serieId: null,
        inicio: em('12T08:00'),
        fim: em('12T10:00'),
        expiraEm: em('12T06:00'),
        reservas: [{ id: 40, inicio: em('12T08:00'), fim: em('12T10:00') }],
      },
    ]);
  });

  it('RN21 · duas Séries no mesmo Recurso são dois itens; o item leva os outros dados da primeira Ocorrência', () => {
    const fila = filaDoGestor(
      [
        { id: 61, serieId: 6, inicio: em('12T08:00'), fim: em('12T10:00'), finalidade: 'Aula' },
        { id: 51, serieId: 5, inicio: em('11T14:00'), fim: em('11T16:00'), finalidade: 'Lab' },
        { id: 62, serieId: 6, inicio: em('19T08:00'), fim: em('19T10:00'), finalidade: 'Aula' },
      ],
      POLITICA,
    );

    expect(
      fila.map(({ id, serieId, finalidade, reservas }) => [
        id,
        serieId,
        finalidade,
        reservas.length,
      ]),
    ).toEqual([
      [51, 5, 'Lab', 1],
      [61, 6, 'Aula', 2],
    ]);
  });

  it('RN12 · o "Expira em" da Série é o Prazo de decisão da primeira Ocorrência Pendente', () => {
    const [item] = filaDoGestor(
      [
        { id: 53, serieId: 5, inicio: em('25T14:00'), fim: em('25T16:00') },
        { id: 52, serieId: 5, inicio: em('18T14:00'), fim: em('18T16:00') },
      ],
      POLITICA,
    );

    expect(item?.expiraEm).toEqual(em('18T12:00'));
  });

  it('RN21 · aprovar uma Ocorrência Pendente sozinha → recusado: a Série é decidida inteira', () => {
    expect(decidirAprovacao(fatos({ serieId: 5 }), CARLOS, em('10T09:00'))).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN21',
          nome: 'Série tudo-ou-nada',
          mensagem: 'Esta Ocorrência é de uma Série: aprove ou recuse a Série inteira, na fila.',
        },
      ],
    });
  });

  it('RN21 · recusar uma Ocorrência Pendente sozinha → recusado, mesmo com justificativa', () => {
    const recusa = { justificativa: 'Sem técnico.' };
    expect(decidirRecusa(fatos({ serieId: 5 }), recusa, CARLOS, em('10T09:00'))).toMatchObject({
      tipo: 'recusada',
      violacoes: [{ rn: 'RN21' }],
    });
  });

  it('RN21 · outro Gestor tentando decidir uma Ocorrência → proibida (403), antes da RN21', () => {
    expect(decidirAprovacao(fatos({ serieId: 5 }), DORA, em('10T09:00'))).toMatchObject({
      tipo: 'proibida',
      violacoes: [{ rn: 'RN13' }],
    });
  });

  it('RN21 · depois de decidida, a Ocorrência segue a vida dela: aprovar a Confirmada cita a RN10', () => {
    expect(
      decidirAprovacao(fatos({ serieId: 5, status: 'Confirmada' }), CARLOS, em('10T09:00')),
    ).toMatchObject({ tipo: 'recusada', violacoes: [{ rn: 'RN10' }] });
  });

  it('RN21 · a Aprovação da Série confirma todas as Ocorrências Pendentes de uma vez, com uma Notificação só (US16)', () => {
    expect(decidirAprovacaoDaSerie(fatosDaSerie(), CARLOS, em('10T09:00'))).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudouEmLote',
          reservaIds: [51, 52, 53],
          transicao: { de: 'Pendente', para: 'Confirmada', em: em('10T09:00'), porId: CARLOS.id },
        },
        {
          evento: 'NotificacaoEmitida',
          notificacao: {
            destinatarioId: EDUARDO.id,
            tipo: 'Aprovacao',
            mensagem:
              'Seu Pedido em Série de Laboratório de Química (3 Ocorrências, de 11/11/2026 a 25/11/2026, das 14:00 às 16:00) foi aprovado.',
            em: em('10T09:00'),
            reservaId: 51,
          },
        },
      ],
    });
  });

  it('RN21 · a Recusa da Série recusa todas as Ocorrências Pendentes com a mesma justificativa (RN11)', () => {
    const recusa = { justificativa: '  Laboratório em reforma no semestre  ' };
    expect(decidirRecusaDaSerie(fatosDaSerie(), recusa, CARLOS, em('10T09:00'))).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudouEmLote',
          reservaIds: [51, 52, 53],
          transicao: {
            de: 'Pendente',
            para: 'Recusada',
            em: em('10T09:00'),
            porId: CARLOS.id,
            observacao: 'Laboratório em reforma no semestre',
          },
        },
        {
          evento: 'NotificacaoEmitida',
          notificacao: {
            destinatarioId: EDUARDO.id,
            tipo: 'Recusa',
            mensagem:
              'Seu Pedido em Série de Laboratório de Química (3 Ocorrências, de 11/11/2026 a 25/11/2026, das 14:00 às 16:00) foi recusado: Laboratório em reforma no semestre.',
            em: em('10T09:00'),
            reservaId: 51,
          },
        },
      ],
    });
  });

  it('RN21 · só as Ocorrências Pendentes são decididas: a cancelada fica de fora', () => {
    const decisao = decidirAprovacaoDaSerie(
      fatosDaSerie([
        { id: 51, status: 'Cancelada', inicio: em('11T14:00'), fim: em('11T16:00') },
        { id: 52, status: 'Pendente', inicio: em('18T14:00'), fim: em('18T16:00') },
        { id: 53, status: 'Pendente', inicio: em('25T14:00'), fim: em('25T16:00') },
      ]),
      CARLOS,
      em('10T09:00'),
    );

    expect(decisao).toMatchObject({
      tipo: 'aceita',
      efeitos: [
        { reservaIds: [52, 53] },
        {
          notificacao: {
            mensagem:
              'Seu Pedido em Série de Laboratório de Química (2 Ocorrências, de 18/11/2026 a 25/11/2026, das 14:00 às 16:00) foi aprovado.',
            reservaId: 52,
          },
        },
      ],
    });
  });

  it('RN21 · Série com uma Ocorrência Pendente só → a Notificação fala de 1 Ocorrência', () => {
    const decisao = decidirAprovacaoDaSerie(
      fatosDaSerie([{ id: 53, status: 'Pendente', inicio: em('25T14:00'), fim: em('25T16:00') }]),
      CARLOS,
      em('10T09:00'),
    );

    expect(decisao).toMatchObject({
      tipo: 'aceita',
      efeitos: [
        { reservaIds: [53] },
        {
          notificacao: {
            mensagem:
              'Seu Pedido em Série de Laboratório de Química (1 Ocorrência, 25/11/2026, das 14:00 às 16:00) foi aprovado.',
          },
        },
      ],
    });
  });

  it('RN11 · Recusa da Série sem justificativa → recusado, pedindo a justificativa', () => {
    expect(
      decidirRecusaDaSerie(fatosDaSerie(), { justificativa: ' ' }, CARLOS, em('10T09:00')),
    ).toMatchObject({ tipo: 'recusada', violacoes: [{ rn: 'RN11', campo: 'justificativa' }] });
  });

  it('RN12 · a Série vence no Prazo de decisão da primeira Ocorrência: às 12h00 de 11/11 → recusado', () => {
    expect(decidirAprovacaoDaSerie(fatosDaSerie(), CARLOS, em('11T12:00'))).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN12',
          nome: 'Expiração',
          mensagem: 'O Prazo de decisão desta Série terminou às 12:00: ela expirou.',
        },
      ],
    });
    expect(decidirAprovacaoDaSerie(fatosDaSerie(), CARLOS, em('11T11:59')).tipo).toBe('aceita');
  });

  it('RN12 · Série com as Ocorrências já Expiradas → recusado citando a Expiração', () => {
    expect(decidirAprovacaoDaSerie(fatosDaSerie(com('Expirada')), CARLOS, em('10T09:00'))).toEqual({
      tipo: 'recusada',
      violacoes: [{ rn: 'RN12', nome: 'Expiração', mensagem: 'Esta Série já expirou.' }],
    });
  });

  it('RN10 · Série já aprovada → recusado: não há Ocorrência Pendente', () => {
    const recusa = { justificativa: 'Mudou o semestre.' };
    expect(
      decidirRecusaDaSerie(fatosDaSerie(com('Confirmada')), recusa, CARLOS, em('10T09:00')),
    ).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN10',
          nome: 'Restrito começa Pendente',
          mensagem: 'Esta Série não aguarda decisão.',
        },
      ],
    });
  });

  it('RN13 · Dora tenta aprovar ou recusar a Série do laboratório do Carlos → proibida (403)', () => {
    expect(decidirAprovacaoDaSerie(fatosDaSerie(), DORA, em('10T09:00'))).toMatchObject({
      tipo: 'proibida',
      violacoes: [{ rn: 'RN13' }],
    });
    expect(
      decidirRecusaDaSerie(fatosDaSerie(), { justificativa: '' }, DORA, em('10T09:00')),
    ).toMatchObject({ tipo: 'proibida', violacoes: [{ rn: 'RN13' }] });
  });
});
