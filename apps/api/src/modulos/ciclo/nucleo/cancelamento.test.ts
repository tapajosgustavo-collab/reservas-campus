import { POLITICA } from '@reservas/shared';
import { describe, expect, it } from 'vitest';
import {
  decidirCancelamento,
  decidirCancelamentoDaSerie,
  type FatosDoCancelamento,
  type FatosDoCancelamentoDaSerie,
} from './cancelamento';

const ANA = { id: 7 };

/** Terça, 10/11/2026, em São Paulo. */
const em = (hora: string) => new Date(`2026-11-10T${hora}:00-03:00`);

/** A Reserva Confirmada da Ana na Sala 101, das 14h às 16h. */
const fatos = (
  reserva: Partial<FatosDoCancelamento['reserva']> = {},
  politica: FatosDoCancelamento['politica'] = POLITICA,
): FatosDoCancelamento => ({
  reserva: {
    id: 42,
    usuarioId: ANA.id,
    inicio: em('14:00'),
    fim: em('16:00'),
    status: 'Confirmada',
    recurso: { nome: 'Sala 101' },
    ...reserva,
  },
  politica,
});

describe('US13 · Cancelar', () => {
  it('a dona cancela a Reserva Confirmada antes do início → Cancelada, com a transição feita por ela', () => {
    expect(decidirCancelamento(fatos(), ANA, em('11:00'))).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 42,
          transicao: { de: 'Confirmada', para: 'Cancelada', em: em('11:00'), porId: 7 },
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

  it('Reserva da Ana às 14h, Ana cancela às 12h30 → Cancelamento tardio, com Penalidade e Notificação', () => {
    expect(decidirCancelamento(fatos(), ANA, em('12:30'))).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 42,
          transicao: { de: 'Confirmada', para: 'Cancelada', em: em('12:30'), porId: 7 },
        },
        {
          evento: 'PenalidadeGerada',
          penalidade: {
            usuarioId: 7,
            reservaId: 42,
            motivo: 'CancelamentoTardio',
            em: em('12:30'),
          },
        },
        {
          evento: 'NotificacaoEmitida',
          notificacao: {
            destinatarioId: 7,
            tipo: 'Penalidade',
            mensagem:
              'Você recebeu uma Penalidade por Cancelamento tardio na Reserva de Sala 101 (10/11/2026, das 14:00 às 16:00): faltavam menos de 2h para o início.',
            em: em('12:30'),
            reservaId: 42,
          },
        },
      ],
    });
  });

  it('Reserva Confirmada às 14h: cancelar às 12h em ponto não gera Penalidade; às 12h01, gera', () => {
    const efeitos = (hora: string) => {
      const decisao = decidirCancelamento(fatos(), ANA, em(hora));
      return decisao.tipo === 'aceita' ? decisao.efeitos.map(({ evento }) => evento) : decisao;
    };

    expect(efeitos('12:00')).toEqual(['StatusMudou']);
    expect(efeitos('12:01')).toEqual(['StatusMudou', 'PenalidadeGerada', 'NotificacaoEmitida']);
  });

  it('cancelar uma Pendente nunca gera Penalidade, nem a minutos do início', () => {
    const decisao = decidirCancelamento(fatos({ status: 'Pendente' }), ANA, em('13:59'));

    expect(decisao.tipo === 'aceita' && decisao.efeitos.map(({ evento }) => evento)).toEqual([
      'StatusMudou',
    ]);
  });

  it('o prazo do Cancelamento tardio vem da Política', () => {
    const umaHora = { ...POLITICA, cancelamentoSemPenalidadeMin: 60 };
    const decisao = decidirCancelamento(fatos({}, umaHora), ANA, em('12:30'));

    expect(decisao.tipo === 'aceita' && decisao.efeitos).toHaveLength(1);
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

const EDUARDO = { id: 9 };

/** Em São Paulo, nas terças de novembro de 2026: `dia('10', '14:00')` é 10/11 às 14h. */
const dia = (dd: string, hora: string) => new Date(`2026-11-${dd}T${hora}:00-03:00`);

/**
 * A Série do Eduardo na Sala 101: três terças (10/11, 17/11 e 24/11), das 14h às 16h, todas
 * Confirmadas.
 */
const fatosDaSerie = (
  ocorrencias: FatosDoCancelamentoDaSerie['serie']['ocorrencias'] = [
    { id: 51, status: 'Confirmada', inicio: dia('10', '14:00'), fim: dia('10', '16:00') },
    { id: 52, status: 'Confirmada', inicio: dia('17', '14:00'), fim: dia('17', '16:00') },
    { id: 53, status: 'Confirmada', inicio: dia('24', '14:00'), fim: dia('24', '16:00') },
  ],
  politica: FatosDoCancelamentoDaSerie['politica'] = POLITICA,
): FatosDoCancelamentoDaSerie => ({
  serie: {
    id: 5,
    usuarioId: EDUARDO.id,
    recurso: { nome: 'Sala 101' },
    ocorrencias,
  },
  politica,
});

describe('US09 · US13 · RN16 · RN21 · Cancelar Série a partir de uma data', () => {
  it('RN16 · outra pessoa tenta cancelar a Série → proibida (403), mesmo sem Ocorrências canceláveis', () => {
    const bruno = { id: 8 };
    const todasCanceladas = fatosDaSerie([
      { id: 51, status: 'Cancelada', inicio: dia('10', '14:00'), fim: dia('10', '16:00') },
    ]);

    expect(
      decidirCancelamentoDaSerie(todasCanceladas, { aPartirDe: '2026-11-10' }, bruno, em('15:00')),
    ).toEqual({
      tipo: 'proibida',
      violacoes: [
        {
          rn: 'RN16',
          nome: 'Cancelamento',
          mensagem: 'Só quem criou a Série pode cancelá-la.',
        },
      ],
    });
  });

  it('RN16 · RN21 · o dono cancela a Série a partir da 2ª data → só as Ocorrências a partir dela são canceladas, em ordem cronológica', () => {
    // Fora de ordem na entrada (24/11 antes de 17/11) para garantir que o núcleo ordena pelo início.
    const foraDeOrdem = fatosDaSerie([
      { id: 53, status: 'Confirmada', inicio: dia('24', '14:00'), fim: dia('24', '16:00') },
      { id: 51, status: 'Confirmada', inicio: dia('10', '14:00'), fim: dia('10', '16:00') },
      { id: 52, status: 'Confirmada', inicio: dia('17', '14:00'), fim: dia('17', '16:00') },
    ]);

    expect(
      decidirCancelamentoDaSerie(foraDeOrdem, { aPartirDe: '2026-11-17' }, EDUARDO, em('11:00')),
    ).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 52,
          transicao: { de: 'Confirmada', para: 'Cancelada', em: em('11:00'), porId: EDUARDO.id },
        },
        {
          evento: 'StatusMudou',
          reservaId: 53,
          transicao: { de: 'Confirmada', para: 'Cancelada', em: em('11:00'), porId: EDUARDO.id },
        },
      ],
    });
  });

  it('RN16 · RN21 · cancelar a partir de hoje a menos de 2h da primeira Ocorrência Confirmada → gera Penalidade só nela, e cancela as seguintes sem Penalidade', () => {
    expect(
      decidirCancelamentoDaSerie(fatosDaSerie(), { aPartirDe: '2026-11-10' }, EDUARDO, em('12:30')),
    ).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 51,
          transicao: { de: 'Confirmada', para: 'Cancelada', em: em('12:30'), porId: EDUARDO.id },
        },
        {
          evento: 'PenalidadeGerada',
          penalidade: {
            usuarioId: EDUARDO.id,
            reservaId: 51,
            motivo: 'CancelamentoTardio',
            em: em('12:30'),
          },
        },
        {
          evento: 'NotificacaoEmitida',
          notificacao: {
            destinatarioId: EDUARDO.id,
            tipo: 'Penalidade',
            mensagem:
              'Você recebeu uma Penalidade por Cancelamento tardio na Reserva de Sala 101 (10/11/2026, das 14:00 às 16:00): faltavam menos de 2h para o início.',
            em: em('12:30'),
            reservaId: 51,
          },
        },
        {
          evento: 'StatusMudou',
          reservaId: 52,
          transicao: { de: 'Confirmada', para: 'Cancelada', em: em('12:30'), porId: EDUARDO.id },
        },
        {
          evento: 'StatusMudou',
          reservaId: 53,
          transicao: { de: 'Confirmada', para: 'Cancelada', em: em('12:30'), porId: EDUARDO.id },
        },
      ],
    });
  });

  it('RN16 · RN21 · Série Pendente cancelada a minutos do início → cancela todas sem Penalidade', () => {
    const pendentes = fatosDaSerie([
      { id: 51, status: 'Pendente', inicio: dia('10', '14:00'), fim: dia('10', '16:00') },
      { id: 52, status: 'Pendente', inicio: dia('17', '14:00'), fim: dia('17', '16:00') },
    ]);

    expect(
      decidirCancelamentoDaSerie(pendentes, { aPartirDe: '2026-11-10' }, EDUARDO, em('13:50')),
    ).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 51,
          transicao: { de: 'Pendente', para: 'Cancelada', em: em('13:50'), porId: EDUARDO.id },
        },
        {
          evento: 'StatusMudou',
          reservaId: 52,
          transicao: { de: 'Pendente', para: 'Cancelada', em: em('13:50'), porId: EDUARDO.id },
        },
      ],
    });
  });

  it('RN16 · RN21 · ignora Ocorrências já passadas, Em uso ou já canceladas a partir da data quando ainda há Ocorrências futuras elegíveis', () => {
    const mistas = fatosDaSerie([
      // A de hoje às 14h já está Em uso (ou já passou às 15h), e a de 17/11 já foi cancelada antes.
      { id: 51, status: 'EmUso', inicio: dia('10', '14:00'), fim: dia('10', '16:00') },
      { id: 52, status: 'Cancelada', inicio: dia('17', '14:00'), fim: dia('17', '16:00') },
      { id: 53, status: 'Confirmada', inicio: dia('24', '14:00'), fim: dia('24', '16:00') },
    ]);

    expect(
      decidirCancelamentoDaSerie(mistas, { aPartirDe: '2026-11-10' }, EDUARDO, em('15:00')),
    ).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 53,
          transicao: { de: 'Confirmada', para: 'Cancelada', em: em('15:00'), porId: EDUARDO.id },
        },
      ],
    });
  });

  it('RNF08 · a data de corte usa o calendário de São Paulo: 22h de 17/11 (-03:00) é 01h UTC de 18/11 e entra em aPartirDe 2026-11-17, mas não em 2026-11-18', () => {
    const noturna = fatosDaSerie([
      {
        id: 52,
        status: 'Confirmada',
        inicio: new Date('2026-11-18T01:00:00Z'),
        fim: new Date('2026-11-18T02:00:00Z'),
      },
    ]);

    expect(
      decidirCancelamentoDaSerie(noturna, { aPartirDe: '2026-11-17' }, EDUARDO, em('11:00')).tipo,
    ).toBe('aceita');
    expect(
      decidirCancelamentoDaSerie(noturna, { aPartirDe: '2026-11-18' }, EDUARDO, em('11:00')),
    ).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN16',
          nome: 'Cancelamento',
          mensagem: 'Não há Ocorrências na Série a partir de 18/11/2026.',
          campo: 'aPartirDe',
        },
      ],
    });
  });

  it('RN16 · nenhuma Ocorrência a partir da data informada → recusado citando a RN16 e o campo aPartirDe', () => {
    expect(
      decidirCancelamentoDaSerie(fatosDaSerie(), { aPartirDe: '2026-12-01' }, EDUARDO, em('11:00')),
    ).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN16',
          nome: 'Cancelamento',
          mensagem: 'Não há Ocorrências na Série a partir de 01/12/2026.',
          campo: 'aPartirDe',
        },
      ],
    });
  });

  it('RN16 · todas as Ocorrências a partir da data já foram canceladas → recusado citando a RN16', () => {
    const jaCanceladas = fatosDaSerie([
      { id: 51, status: 'Confirmada', inicio: dia('10', '14:00'), fim: dia('10', '16:00') },
      { id: 52, status: 'Cancelada', inicio: dia('17', '14:00'), fim: dia('17', '16:00') },
      { id: 53, status: 'Cancelada', inicio: dia('24', '14:00'), fim: dia('24', '16:00') },
    ]);

    expect(
      decidirCancelamentoDaSerie(jaCanceladas, { aPartirDe: '2026-11-17' }, EDUARDO, em('11:00')),
    ).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN16',
          nome: 'Cancelamento',
          mensagem: 'As Ocorrências a partir de 17/11/2026 já foram canceladas.',
        },
      ],
    });
  });

  it('RN16 · a única Ocorrência a partir da data já começou (ou já encerrou) → recusado citando a RN16', () => {
    expect(
      decidirCancelamentoDaSerie(
        fatosDaSerie(),
        { aPartirDe: '2026-11-24' },
        EDUARDO,
        dia('24', '14:00'),
      ),
    ).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN16',
          nome: 'Cancelamento',
          mensagem:
            'Não há Ocorrências que possam ser canceladas a partir de 24/11/2026: elas já começaram ou foram encerradas.',
        },
      ],
    });
  });
});
