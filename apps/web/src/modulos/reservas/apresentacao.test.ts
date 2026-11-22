import type { ItemDeReserva } from '@reservas/shared';
import { describe, expect, it } from 'vitest';
import {
  agruparPorSerie,
  paginasDe,
  rotuloDaSerieNaPagina,
  rotuloDaTransicao,
  rotuloDoInstante,
  rotuloDoIntervalo,
  ROTULO_DO_STATUS,
} from './apresentacao';

describe('US10 · Minhas reservas na tela', () => {
  it('o Status aparece com o nome do glossário, com acento', () => {
    expect(ROTULO_DO_STATUS.EmUso).toBe('Em uso');
    expect(ROTULO_DO_STATUS.Concluida).toBe('Concluída');
    expect(ROTULO_DO_STATUS.NaoComparecimento).toBe('Não comparecimento');
  });

  it('o Intervalo sai no horário de São Paulo, mesmo com a entrada em UTC', () => {
    expect(rotuloDoIntervalo('2026-11-11T01:00:00Z', '2026-11-11T02:00:00Z')).toBe(
      '10/11/2026, das 22:00 às 23:00',
    );
  });

  it('o instante do histórico sai no horário de São Paulo', () => {
    expect(rotuloDoInstante('2026-11-11T01:30:00Z')).toBe('10/11/2026 às 22:30');
  });

  it('a primeira transição diz como a Reserva nasceu', () => {
    expect(rotuloDaTransicao({ de: null, para: 'Confirmada' })).toBe('Criada como Confirmada');
  });

  it('as demais dizem de qual Status para qual', () => {
    expect(rotuloDaTransicao({ de: 'Confirmada', para: 'EmUso' })).toBe('Confirmada → Em uso');
  });

  it.each([
    [0, 1],
    [20, 1],
    [21, 2],
    [40, 2],
    [41, 3],
  ])('%i Reservas com 20 por página → %i páginas', (total, paginas) => {
    expect(paginasDe(total, 20)).toBe(paginas);
  });
});

const umaOcorrencia = (
  id: number,
  dia: string,
  serieId: number | null,
  nome = 'Sala 101',
): ItemDeReserva => ({
  id,
  recursoId: 1,
  serieId,
  inicio: `2026-11-${dia}T10:00:00-03:00`,
  fim: `2026-11-${dia}T12:00:00-03:00`,
  participantes: 20,
  finalidade: 'Aula',
  status: 'Confirmada',
  criadaEm: '2026-11-01T08:00:00-03:00',
  recurso: { id: 1, nome, tipo: 'Espaco' },
});

describe('US10 · RN21 · Agrupamento de Série em Minhas reservas', () => {
  it('agrupa todas as Ocorrências da mesma Série na página na posição da primeira que aparece, mantendo as avulsas na ordem', () => {
    const primeiraDaSerie = umaOcorrencia(51, '10', 5);
    const avulsa = umaOcorrencia(40, '12', null, 'Laboratório 2');
    const segundaDaSerie = umaOcorrencia(52, '17', 5);
    const outraSerie = umaOcorrencia(61, '18', 6, 'Auditório');
    const terceiraDaSerie = umaOcorrencia(53, '24', 5);

    expect(
      agruparPorSerie([primeiraDaSerie, avulsa, segundaDaSerie, outraSerie, terceiraDaSerie]),
    ).toEqual([
      {
        tipo: 'serie',
        serieId: 5,
        recurso: primeiraDaSerie.recurso,
        ocorrencias: [primeiraDaSerie, segundaDaSerie, terceiraDaSerie],
      },
      { tipo: 'avulsa', reserva: avulsa },
      {
        tipo: 'serie',
        serieId: 6,
        recurso: outraSerie.recurso,
        ocorrencias: [outraSerie],
      },
    ]);
  });

  it('o rótulo da Série mostra quantas Ocorrências estão na página e as datas em São Paulo (mesmo se a Série estiver dividida entre páginas)', () => {
    expect(
      rotuloDaSerieNaPagina([
        umaOcorrencia(51, '10', 5),
        umaOcorrencia(52, '17', 5),
        umaOcorrencia(53, '24', 5),
      ]),
    ).toBe('Série · 3 Ocorrências nesta página (10/11, 17/11 e 24/11)');

    expect(rotuloDaSerieNaPagina([umaOcorrencia(53, '24', 5)])).toBe(
      'Série · 1 Ocorrência nesta página (24/11)',
    );
  });
});
