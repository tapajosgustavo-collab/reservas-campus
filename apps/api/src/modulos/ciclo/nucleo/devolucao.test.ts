import { describe, expect, it } from 'vitest';
import { decidirDevolucao, devolucaoAtrasada, type FatosDaDevolucao } from './devolucao';

const CARLOS = { id: 3 };
const DORA = { id: 4 };

/** Terça, 10/11/2026, em São Paulo. */
const em = (hora: string) => new Date(`2026-11-10T${hora}:00-03:00`);

const POLITICA = { toleranciaDeDevolucaoMin: 15 };

/** A Reserva Em uso do projetor P-123, cadastrado pelo Carlos. */
const fatos = (
  reserva: Partial<FatosDaDevolucao['reserva']> = {},
  recurso: Partial<FatosDaDevolucao['reserva']['recurso']> = {},
): FatosDaDevolucao => ({
  reserva: {
    id: 42,
    status: 'EmUso',
    ...reserva,
    recurso: { tipo: 'Equipamento', gestorId: CARLOS.id, ...recurso },
  },
});

describe('US14 · Registrar Devolução', () => {
  it('o Gestor responsável registra a Devolução de um Equipamento Em uso → Concluída, com a transição feita por ele', () => {
    expect(decidirDevolucao(fatos(), {}, CARLOS, em('12:10'))).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 42,
          transicao: { de: 'EmUso', para: 'Concluida', em: em('12:10'), porId: CARLOS.id },
        },
      ],
    });
  });

  it('com observação opcional → grava a observação na transição', () => {
    expect(
      decidirDevolucao(fatos(), { observacao: 'Voltou com o cabo HDMI.' }, CARLOS, em('12:10')),
    ).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 42,
          transicao: {
            de: 'EmUso',
            para: 'Concluida',
            em: em('12:10'),
            porId: CARLOS.id,
            observacao: 'Voltou com o cabo HDMI.',
          },
        },
      ],
    });
  });
});

describe('RN13 · Gestor do Recurso', () => {
  it('Carlos cadastra o projetor P-123, Dora tenta registrar a Devolução do P-123 → proibida (403)', () => {
    // Mesmo que a Reserva já esteja Concluída e sem observação de perda, outro Gestor só recebe o 403.
    expect(
      decidirDevolucao(fatos({ status: 'Concluida' }), { extraviado: true }, DORA, em('12:10')),
    ).toEqual({
      tipo: 'proibida',
      violacoes: [
        {
          rn: 'RN13',
          nome: 'Gestor do Recurso',
          mensagem: 'Só o Gestor responsável por este Recurso pode registrar a Devolução dele.',
        },
      ],
    });
  });

  it('Carlos registra a Devolução do P-123 que ele cadastrou → aceito', () => {
    expect(decidirDevolucao(fatos(), {}, CARLOS, em('12:10')).tipo).toBe('aceita');
  });
});

describe('RN17 · Devolução atrasada', () => {
  it('Reserva 10h–12h, Devolução às 12h10 → Concluída, e às 12h10 ainda não está atrasada', () => {
    expect(devolucaoAtrasada(em('12:00'), POLITICA, em('12:10'))).toBe(false);
    expect(devolucaoAtrasada(em('12:00'), POLITICA, em('12:14'))).toBe(false);
    expect(decidirDevolucao(fatos(), {}, CARLOS, em('12:10')).tipo).toBe('aceita');
  });

  it('Reserva 10h–12h, às 12h15 (fim da Tolerância de Devolução) → fica em Devolução atrasada', () => {
    expect(devolucaoAtrasada(em('12:00'), POLITICA, em('12:15'))).toBe(true);
    expect(devolucaoAtrasada(em('12:00'), POLITICA, em('12:20'))).toBe(true);
  });

  it('a Tolerância de Devolução sai da Política: com 30 min, às 12h20 ainda não está atrasada', () => {
    expect(devolucaoAtrasada(em('12:00'), { toleranciaDeDevolucaoMin: 30 }, em('12:20'))).toBe(
      false,
    );
  });

  it('Reserva 10h–12h, Devolução às 12h20 → Concluída, sem gerar Penalidade na Devolução', () => {
    expect(decidirDevolucao(fatos(), {}, CARLOS, em('12:20'))).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 42,
          transicao: { de: 'EmUso', para: 'Concluida', em: em('12:20'), porId: CARLOS.id },
        },
      ],
    });
  });

  it('Devolução antecipada: Reserva 10h–14h, Devolução às 11h → Concluída na hora', () => {
    expect(decidirDevolucao(fatos(), {}, CARLOS, em('11:00'))).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 42,
          transicao: { de: 'EmUso', para: 'Concluida', em: em('11:00'), porId: CARLOS.id },
        },
      ],
    });
  });

  it('Equipamento perdido ou roubado sem observação → recusado, exigindo a observação', () => {
    expect(decidirDevolucao(fatos(), { extraviado: true }, CARLOS, em('12:10'))).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN17',
          nome: 'Devolução atrasada',
          mensagem: 'Informe uma observação explicando a perda ou o roubo do Equipamento.',
          campo: 'observacao',
        },
      ],
    });
  });

  it('Equipamento perdido ou roubado com observação em branco → recusado', () => {
    expect(
      decidirDevolucao(fatos(), { extraviado: true, observacao: '   ' }, CARLOS, em('12:10')),
    ).toMatchObject({
      tipo: 'recusada',
      violacoes: [{ rn: 'RN17', campo: 'observacao' }],
    });
  });

  it('Equipamento perdido ou roubado com observação → Concluída, com a observação na transição', () => {
    expect(
      decidirDevolucao(
        fatos(),
        { extraviado: true, observacao: 'Equipamento furtado no ponto de ônibus.' },
        CARLOS,
        em('12:10'),
      ),
    ).toEqual({
      tipo: 'aceita',
      efeitos: [
        {
          evento: 'StatusMudou',
          reservaId: 42,
          transicao: {
            de: 'EmUso',
            para: 'Concluida',
            em: em('12:10'),
            porId: CARLOS.id,
            observacao: 'Equipamento furtado no ponto de ônibus.',
          },
        },
      ],
    });
  });

  it('Reserva de Espaço → recusado: Espaço conclui sozinho no fim do Intervalo', () => {
    expect(decidirDevolucao(fatos({}, { tipo: 'Espaco' }), {}, CARLOS, em('12:10'))).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN17',
          nome: 'Devolução atrasada',
          mensagem: 'Só Reserva de Equipamento tem Devolução.',
        },
      ],
    });
  });

  it('Devolução já registrada (Concluída) → recusado', () => {
    expect(decidirDevolucao(fatos({ status: 'Concluida' }), {}, CARLOS, em('12:10'))).toEqual({
      tipo: 'recusada',
      violacoes: [
        {
          rn: 'RN17',
          nome: 'Devolução atrasada',
          mensagem: 'A Devolução desta Reserva já foi registrada.',
        },
      ],
    });
  });

  it.each(['Pendente', 'Confirmada'] as const)(
    'Reserva %s (ainda sem Check-in) → recusado',
    (status) => {
      expect(decidirDevolucao(fatos({ status }), {}, CARLOS, em('12:10'))).toEqual({
        tipo: 'recusada',
        violacoes: [
          {
            rn: 'RN17',
            nome: 'Devolução atrasada',
            mensagem: 'Esta Reserva ainda não está em uso.',
          },
        ],
      });
    },
  );

  it.each(['Recusada', 'Expirada', 'Cancelada', 'NaoComparecimento'] as const)(
    'Reserva %s → recusado: já foi encerrada',
    (status) => {
      expect(decidirDevolucao(fatos({ status }), {}, CARLOS, em('12:10'))).toEqual({
        tipo: 'recusada',
        violacoes: [
          {
            rn: 'RN17',
            nome: 'Devolução atrasada',
            mensagem: 'Esta Reserva já foi encerrada e não aceita Devolução.',
          },
        ],
      });
    },
  );
});
