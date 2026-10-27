import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from '../comum/banco';
import { bancoDeTeste, comBanco, esvaziar, umUsuario } from '../teste/banco';
import { semear } from './semear';

let banco: Banco;

comBanco('RNF10 · Seed', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('com o banco vazio, roda', async () => {
    expect(await semear(banco)).toBe('semeado');
  });

  it('com dados no banco, não toca em nada', async () => {
    const existente = await umUsuario(banco);

    expect(await semear(banco)).toBe('ignorado');
    expect(await banco.usuario.findMany()).toEqual([existente]);
  });
});
