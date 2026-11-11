import type { Ocupacao } from '@reservas/shared';
import { describe, expect, it } from 'vitest';
import type { DiaDaGrade } from './grade';
import { reservaNaCelula } from './visaoDoGestor';

/** Terça, 10/11/2026, das 7h às 23h. */
const terca: DiaDaGrade = { data: '2026-11-10', diaSemana: 2, abre: 7 * 60, fecha: 23 * 60 };

/** A Reserva do Bruno, 10h–11h, como o Gestor responsável a recebe da API. */
const doBruno: Ocupacao = {
  inicio: '2026-11-10T10:00:00-03:00',
  fim: '2026-11-10T11:00:00-03:00',
  reservaId: 50,
  status: 'EmUso',
  usuario: { id: 2, nome: 'Bruno' },
  finalidade: 'Estudo',
};

describe('RN22 · Visão do Gestor responsável na agenda', () => {
  it('RN22 · a primeira célula da Reserva diz quem reservou e o Status', () => {
    expect(reservaNaCelula(terca, 10 * 60, doBruno)).toEqual({
      primeira: true,
      texto: 'Bruno · Em uso',
      descricao: 'Reserva de Bruno, Em uso, Finalidade: Estudo',
      endereco: '/reservas/50',
    });
  });

  it('RN22 · toda célula da Reserva leva ao detalhe, que mostra a Finalidade', () => {
    expect(reservaNaCelula(terca, 10 * 60 + 30, doBruno)).toMatchObject({
      endereco: '/reservas/50',
    });
  });

  it('RN22 · as células seguintes da mesma Reserva não repetem o texto', () => {
    expect(reservaNaCelula(terca, 10 * 60 + 30, doBruno)).toMatchObject({ primeira: false });
  });

  it('RN22 · duas Reservas seguidas: a segunda também começa com o texto', () => {
    const daAna: Ocupacao = {
      ...doBruno,
      inicio: '2026-11-10T11:00:00-03:00',
      fim: '2026-11-10T12:00:00-03:00',
      reservaId: 51,
      status: 'Pendente',
      usuario: { id: 1, nome: 'Ana' },
      finalidade: null,
    };

    expect(reservaNaCelula(terca, 11 * 60, daAna)).toEqual({
      primeira: true,
      texto: 'Ana · Pendente',
      descricao: 'Reserva de Ana, Pendente, sem Finalidade',
      endereco: '/reservas/51',
    });
  });

  it('RN22 · a Reserva que começa no meio da meia hora mostra o texto nessa célula', () => {
    const dasDezEQuinze: Ocupacao = { ...doBruno, inicio: '2026-11-10T10:15:00-03:00' };

    expect(reservaNaCelula(terca, 10 * 60, dasDezEQuinze)).toMatchObject({ primeira: true });
  });

  it('RN22 · a Reserva que começa antes da abertura mostra o texto na primeira célula do dia', () => {
    const cedo: Ocupacao = { ...doBruno, inicio: '2026-11-10T06:00:00-03:00' };

    expect(reservaNaCelula(terca, 7 * 60, cedo)).toMatchObject({ primeira: true });
  });

  it('RN22 · sem o nome (quem não é o Gestor responsável), a célula não diz nada nem leva a lugar algum', () => {
    const soOcupado: Ocupacao = { inicio: doBruno.inicio, fim: doBruno.fim };

    expect(reservaNaCelula(terca, 10 * 60, soOcupado)).toBeNull();
  });

  it('célula sem Ocupação não tem Reserva', () => {
    expect(reservaNaCelula(terca, 9 * 60, undefined)).toBeNull();
  });
});
