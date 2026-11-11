import { datasDaSerie, POLITICA } from '@reservas/shared';
import { describe, expect, it } from 'vitest';
import type { FatosDaReserva } from './reservar';
import { decidirSerie, type PedidoDeSerie } from './serie';

// Segunda, 09/11/2026, 8h.
const AGORA = new Date('2026-11-09T08:00:00-03:00');
const ANA = { id: 7, perfil: 'Aluno' } as const;
const CARLA = { id: 9, perfil: 'Docente' } as const;

const em = (data: string, hora: string) => new Date(`${data}T${hora}:00-03:00`);

/** Terças das 10h às 12h a partir de 10/11/2026. */
const serie = (dados: Partial<PedidoDeSerie> = {}): PedidoDeSerie => ({
  recursoId: 3,
  inicio: em('2026-11-10', '10:00'),
  fim: em('2026-11-10', '12:00'),
  participantes: 20,
  ate: '2026-11-24',
  datasExcluidas: [],
  ...dados,
});

const fatos = (dados: Partial<FatosDaReserva> = {}): FatosDaReserva => ({
  horarios: [{ diaSemana: 2, abre: 7 * 60, fecha: 23 * 60 }],
  reservasDoRecurso: [],
  indisponibilidades: [],
  recurso: { tipo: 'Espaco', capacidade: 30, restrito: false },
  ativasDoUsuario: [],
  politica: POLITICA,
  ...dados,
});

function inicios(decisao: ReturnType<typeof decidirSerie>) {
  if (decisao.tipo !== 'aceita') throw new Error(`esperava aceita, veio ${decisao.tipo}`);
  return decisao.efeitos[0].ocorrencias.map(({ reserva }) => reserva.inicio);
}

describe('datasDaSerie', () => {
  it('toda semana a partir da primeira, até a data final inclusive', () => {
    expect(datasDaSerie('2026-12-22', '2027-01-12', 18)).toEqual([
      '2026-12-22',
      '2026-12-29',
      '2027-01-05',
      '2027-01-12',
    ]);
  });

  it('para no limite e devolve nada com a data final antes da primeira', () => {
    expect(datasDaSerie('2026-11-10', '2030-01-01', 3)).toHaveLength(3);
    expect(datasDaSerie('2026-11-10', '2026-11-09', 18)).toEqual([]);
  });
});

describe('US09 · Criar Série', () => {
  it('três terças livres → a Série e três Ocorrências Confirmadas, com a mesma Finalidade', () => {
    const decisao = decidirSerie(fatos(), serie({ finalidade: 'Aula de Cálculo' }), CARLA, AGORA);

    expect(decisao).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'SerieCriada',
          serie: { usuarioId: 9, recursoId: 3, criadaEm: AGORA },
          ocorrencias: ['2026-11-10', '2026-11-17', '2026-11-24'].map((data) => ({
            reserva: {
              usuarioId: 9,
              recursoId: 3,
              inicio: em(data, '10:00'),
              fim: em(data, '12:00'),
              participantes: 20,
              finalidade: 'Aula de Cálculo',
              status: 'Confirmada',
              criadaEm: AGORA,
            },
            transicao: { de: null, para: 'Confirmada', em: AGORA, porId: 9 },
          })),
        },
      ],
    });
  });
});

describe('RN21 · Série tudo-ou-nada', () => {
  it('Aluno tenta criar uma Série → proibida, citando a RN21', () => {
    expect(decidirSerie(fatos(), serie(), ANA, AGORA)).toEqual({
      tipo: 'proibida',
      violacoes: [
        { rn: 'RN21', nome: 'Série tudo-ou-nada', mensagem: 'Só Docentes criam Séries.' },
      ],
    });
  });

  it('uma Ocorrência com Conflito → nenhuma é criada, e a recusa diz a data', () => {
    const ocupada = { inicio: em('2026-11-24', '11:00'), fim: em('2026-11-24', '13:00') };
    const decisao = decidirSerie(
      fatos({ reservasDoRecurso: [{ ...ocupada, status: 'Confirmada' }] }),
      serie(),
      CARLA,
      AGORA,
    );

    expect(decisao).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN01',
          nome: 'Sem Conflito',
          mensagem: 'Este Recurso já está ocupado das 11:00 às 13:00.',
          campo: 'intervalo',
          data: '2026-11-24',
        },
      ],
    });
  });

  it('duas datas falham por regras diferentes → a recusa lista cada data com a sua regra', () => {
    const decisao = decidirSerie(
      fatos({
        reservasDoRecurso: [
          {
            inicio: em('2026-11-17', '10:00'),
            fim: em('2026-11-17', '12:00'),
            status: 'Pendente',
          },
        ],
        indisponibilidades: [
          { inicio: em('2026-11-24', '00:00'), fim: em('2026-11-25', '00:00'), motivo: 'Colação' },
        ],
      }),
      serie(),
      CARLA,
      AGORA,
    );

    expect(decisao.tipo).toBe('recusada');
    expect(decisao.tipo === 'recusada' && decisao.violacoes).toMatchObject([
      { rn: 'RN01', data: '2026-11-17' },
      { rn: 'RN04', data: '2026-11-24', mensagem: expect.stringContaining('Colação') },
    ]);
  });

  it('data desmarcada não vira Ocorrência nem é validada, mesmo com Indisponibilidade nela', () => {
    const decisao = decidirSerie(
      fatos({
        indisponibilidades: [
          { inicio: em('2026-11-17', '00:00'), fim: em('2026-11-18', '00:00'), motivo: 'Feriado' },
        ],
      }),
      serie({ datasExcluidas: ['2026-11-17'] }),
      CARLA,
      AGORA,
    );

    expect(inicios(decisao)).toEqual([em('2026-11-10', '10:00'), em('2026-11-24', '10:00')]);
  });

  it(`a Série cobre até ${POLITICA.semanasMaximasDaSerie} semanas, contando as desmarcadas`, () => {
    // 10/11/2026 + 17 semanas = 09/03/2027: 18 datas, 112 dias depois do agora (passa dos 60 da
    // Antecedência máxima de Docente, que não vale na Série).
    const dezoito = decidirSerie(
      fatos(),
      serie({ ate: '2027-03-09', datasExcluidas: ['2026-12-22'] }),
      CARLA,
      AGORA,
    );
    expect(inicios(dezoito)).toHaveLength(17);
    expect(inicios(dezoito).at(-1)).toEqual(em('2027-03-09', '10:00'));

    expect(decidirSerie(fatos(), serie({ ate: '2027-03-16' }), CARLA, AGORA)).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN21',
          nome: 'Série tudo-ou-nada',
          mensagem:
            'A Série cobre no máximo 18 semanas: a última Ocorrência pode ser em 09/03/2027.',
          campo: 'ate',
        },
      ],
    });
  });

  it('data final antes da primeira Ocorrência → recusada', () => {
    const decisao = decidirSerie(fatos(), serie({ ate: '2026-11-09' }), CARLA, AGORA);

    expect(decisao).toMatchObject({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN21',
          mensagem: 'A data final (09/11/2026) não pode ser antes da primeira Ocorrência.',
          campo: 'ate',
        },
      ],
    });
  });

  it('desmarcar uma data que não é da Série → recusada, com a data', () => {
    const decisao = decidirSerie(fatos(), serie({ datasExcluidas: ['2026-11-18'] }), CARLA, AGORA);

    expect(decisao).toMatchObject({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN21',
          mensagem: '18/11/2026 não é uma data da Série.',
          campo: 'datasExcluidas',
          data: '2026-11-18',
        },
      ],
    });
  });

  it('todas as datas desmarcadas → recusada, a Série ficaria vazia', () => {
    const decisao = decidirSerie(
      fatos(),
      serie({ datasExcluidas: ['2026-11-10', '2026-11-17', '2026-11-24'] }),
      CARLA,
      AGORA,
    );

    expect(decisao).toMatchObject({
      tipo: 'recusada',
      violacoes: [{ rn: 'RN21', campo: 'datasExcluidas' }],
    });
  });

  it('RN05 · Antecedência mínima vale em cada Ocorrência: só a primeira falha', () => {
    const decisao = decidirSerie(fatos(), serie(), CARLA, em('2026-11-10', '09:30'));

    expect(decisao).toMatchObject({
      tipo: 'recusada',
      violacoes: [{ rn: 'RN05', data: '2026-11-10' }],
    });
  });

  it('RN07 · a Série nova conta 1 na Cota: Docente com 9 ativas cria, com 10 não', () => {
    const ativas = (quantas: number) =>
      Array.from({ length: quantas }, (_, i) => ({ id: i + 1, serieId: null }));

    expect(decidirSerie(fatos({ ativasDoUsuario: ativas(9) }), serie(), CARLA, AGORA).tipo).toBe(
      'aceita',
    );
    expect(decidirSerie(fatos({ ativasDoUsuario: ativas(10) }), serie(), CARLA, AGORA)).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN07',
          nome: 'Cota',
          mensagem: 'Você já tem 10 Reservas ativas, e a Cota de Docente é 10.',
        },
      ],
    });
  });

  it('RN06 e RN08 valem para todas as Ocorrências e aparecem uma vez só, sem data', () => {
    const decisao = decidirSerie(
      fatos(),
      serie({ fim: em('2026-11-10', '15:00'), participantes: 40 }),
      CARLA,
      AGORA,
    );

    expect(decisao).toMatchObject({
      tipo: 'recusada',
      violacoes: [
        { rn: 'RN06', mensagem: 'A Duração máxima de Docente em Espaço é 4h.' },
        { rn: 'RN08', mensagem: 'Este Espaço comporta até 30 pessoas.' },
      ],
    });
    expect(decisao.tipo === 'recusada' && decisao.violacoes.map((v) => v.data)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('RN02 · Intervalo inválido aparece uma vez só', () => {
    const decisao = decidirSerie(
      fatos(),
      serie({ inicio: em('2026-11-10', '10:15'), fim: em('2026-11-10', '12:00') }),
      CARLA,
      AGORA,
    );

    expect(decisao).toMatchObject({ tipo: 'recusada', violacoes: [{ rn: 'RN02' }] });
  });

  it('RN03 · dia em que o Recurso não abre → a recusa lista cada data', () => {
    const decisao = decidirSerie(fatos({ horarios: [] }), serie(), CARLA, AGORA);

    expect(decisao).toMatchObject({
      tipo: 'recusada',
      violacoes: [
        { rn: 'RN03', data: '2026-11-10' },
        { rn: 'RN03', data: '2026-11-17' },
        { rn: 'RN03', data: '2026-11-24' },
      ],
    });
  });

  it('RN10 · em Recurso restrito todas as Ocorrências nascem Pendentes', () => {
    const decisao = decidirSerie(
      fatos({ recurso: { tipo: 'Espaco', capacidade: 30, restrito: true } }),
      serie(),
      CARLA,
      AGORA,
    );

    expect(decisao.tipo === 'aceita' && decisao.efeitos[0].ocorrencias).toMatchObject([
      { reserva: { status: 'Pendente' }, transicao: { para: 'Pendente' } },
      { reserva: { status: 'Pendente' }, transicao: { para: 'Pendente' } },
      { reserva: { status: 'Pendente' }, transicao: { para: 'Pendente' } },
    ]);
  });
});
