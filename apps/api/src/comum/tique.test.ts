import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarTique } from './tique';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Tique de 1 minuto', () => {
  it('roda a tarefa uma vez por minuto até ser parado', async () => {
    let execucoes = 0;
    const parar = iniciarTique(
      async () => execucoes++,
      60_000,
      () => {},
    );

    await vi.advanceTimersByTimeAsync(3 * 60_000);
    parar();
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(execucoes).toBe(3);
  });

  it('não começa um tique enquanto o anterior ainda roda', async () => {
    let comecados = 0;
    let terminar = () => {};
    const parar = iniciarTique(
      () => {
        comecados++;
        return new Promise<void>((resolve) => (terminar = resolve));
      },
      60_000,
      () => {},
    );

    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(comecados).toBe(1);

    terminar();
    await vi.advanceTimersByTimeAsync(60_000);
    parar();

    expect(comecados).toBe(2);
  });

  it('uma falha é entregue a quem trata e os tiques seguintes continuam', async () => {
    const falhas: unknown[] = [];
    let execucoes = 0;
    const parar = iniciarTique(
      async () => {
        execucoes++;
        if (execucoes === 1) throw new Error('banco fora do ar');
      },
      60_000,
      (erro) => falhas.push(erro),
    );

    await vi.advanceTimersByTimeAsync(2 * 60_000);
    parar();

    expect(falhas).toEqual([new Error('banco fora do ar')]);
    expect(execucoes).toBe(2);
  });
});
