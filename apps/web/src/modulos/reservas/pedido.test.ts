import { describe, expect, it } from 'vitest';
import {
  avisoDoPedido,
  corpoDaReserva,
  corpoDaSerie,
  linhaDaViolacaoNaSerie,
  reservaCobre,
  resumoDaCriada,
  resumoDaSerie,
  semanaDe,
  tituloDasViolacoes,
} from './pedido';

const dasDezAoMeioDia = {
  inicio: '2026-11-10T10:00:00-03:00',
  fim: '2026-11-10T12:00:00-03:00',
};

const formulario = { data: '2026-11-10', inicio: 10 * 60, fim: 12 * 60 };

describe('US08 · Corpo do pedido de Reserva', () => {
  it('Data, Início e Fim viram instantes com o deslocamento de São Paulo', () => {
    expect(corpoDaReserva(3, formulario)).toEqual({ recursoId: 3, ...dasDezAoMeioDia });
  });

  it('Fim 24:00 é 0h do dia seguinte', () => {
    expect(corpoDaReserva(3, { ...formulario, fim: 24 * 60 }).fim).toBe(
      '2026-11-11T00:00:00-03:00',
    );
  });

  it('Participantes e Finalidade só vão preenchidos', () => {
    expect(corpoDaReserva(3, { ...formulario, participantes: 20, finalidade: ' Aula ' })).toEqual({
      recursoId: 3,
      ...dasDezAoMeioDia,
      participantes: 20,
      finalidade: 'Aula',
    });
    expect(corpoDaReserva(3, { ...formulario, finalidade: '   ' })).not.toHaveProperty(
      'finalidade',
    );
  });
});

describe('RNF09 · Violações na janela', () => {
  it.each([
    [1, 'Não foi possível reservar. 1 regra impede esta Reserva:'],
    [3, 'Não foi possível reservar. 3 regras impedem esta Reserva:'],
  ])('%i violações → título no singular ou plural', (quantas, titulo) => {
    expect(tituloDasViolacoes(quantas)).toBe(titulo);
  });
});

describe('US08 · Depois de criar', () => {
  it('RN14 · a mensagem diz a janela de Check-in, de 15 min antes a 15 min depois do início', () => {
    expect(resumoDaCriada({ ...dasDezAoMeioDia, status: 'Confirmada' })).toBe(
      'Reserva criada para 10/11, das 10:00 às 12:00. Faça o Check-in das 09:45 às 10:15.',
    );
  });

  it('a célula destacada é a que a Reserva cobre, sem contar a do fim', () => {
    expect(reservaCobre(dasDezAoMeioDia, '2026-11-10', 10 * 60)).toBe(true);
    expect(reservaCobre(dasDezAoMeioDia, '2026-11-10', 11 * 60 + 30)).toBe(true);
    expect(reservaCobre(dasDezAoMeioDia, '2026-11-10', 12 * 60)).toBe(false);
    expect(reservaCobre(dasDezAoMeioDia, '2026-11-11', 10 * 60)).toBe(false);
  });

  it('a agenda volta na semana da Reserva, que começa na segunda', () => {
    expect(semanaDe('2026-11-15')).toBe('2026-11-09');
    expect(semanaDe('2026-11-09')).toBe('2026-11-09');
  });
});

describe('RN10 · Pedido em Recurso restrito', () => {
  it('o aviso diz quem aprova e até quando: o Prazo de decisão, 2h antes do início', () => {
    expect(avisoDoPedido('Carlos', { data: '2026-11-11', inicio: 10 * 60 })).toBe(
      'Recurso restrito: o Pedido fica Pendente até Carlos aprovar, o que precisa acontecer ' +
        'até 11/11 às 08:00, 2h antes do início. Sem decisão até lá, ele expira.',
    );
  });

  it('início à 01:00 → o prazo cai no dia anterior', () => {
    expect(avisoDoPedido('Dora', { data: '2026-11-12', inicio: 60 })).toContain(
      'até 11/11 às 23:00',
    );
  });

  it('Data apagada no formulário → o aviso fica sem a data, sem quebrar a janela', () => {
    expect(avisoDoPedido('Dora', { data: '', inicio: 10 * 60 })).toBe(
      'Recurso restrito: o Pedido fica Pendente até Dora aprovar, o que precisa acontecer ' +
        'até 2h antes do início. Sem decisão até lá, ele expira.',
    );
  });

  it('depois de enviar, a agenda diz que o Pedido está Pendente, sem a janela de Check-in', () => {
    expect(resumoDaCriada({ ...dasDezAoMeioDia, status: 'Pendente' })).toBe(
      'Pedido enviado para 10/11, das 10:00 às 12:00. Ele fica Pendente até a Aprovação do Gestor.',
    );
  });
});

describe('US09 · Série', () => {
  it('o corpo da Série é o da Reserva com a data final e as datas desmarcadas', () => {
    expect(corpoDaSerie(3, formulario, '2026-11-24', ['2026-11-17'])).toEqual({
      recursoId: 3,
      ...dasDezAoMeioDia,
      ate: '2026-11-24',
      datasExcluidas: ['2026-11-17'],
    });
  });

  it('RN21 · a violação de uma Ocorrência vem com a data dela; a da Série inteira, sem', () => {
    const conflito = { rn: 'RN01', nome: 'Sem Conflito', mensagem: 'Ocupado.' };
    expect(linhaDaViolacaoNaSerie({ ...conflito, data: '2026-11-24' }, 'RN01 · x')).toBe(
      '24/11 · RN01 · x',
    );
    expect(linhaDaViolacaoNaSerie(conflito, 'RN01 · x')).toBe('RN01 · x');
  });

  it('o resumo diz quantas Ocorrências, de quando a quando, e o próximo passo', () => {
    const tercas = ['10', '17', '24'].map((dia) => ({
      inicio: `2026-11-${dia}T10:00:00-03:00`,
      fim: `2026-11-${dia}T12:00:00-03:00`,
      status: 'Confirmada' as const,
    }));

    expect(resumoDaSerie(tercas)).toBe(
      'Série criada: 3 Ocorrências de 10/11 a 24/11, das 10:00 às 12:00. Faça o Check-in de cada uma na hora.',
    );
    expect(resumoDaSerie(tercas.map((t) => ({ ...t, status: 'Pendente' as const })))).toContain(
      'Pendentes até o Gestor decidir a Série',
    );
  });
});
