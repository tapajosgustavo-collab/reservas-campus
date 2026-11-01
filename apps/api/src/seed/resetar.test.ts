import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { Banco } from '../comum/banco';
import { bancoDeTeste, comBanco, esvaziar, umUsuario } from '../teste/banco';
import { resetar } from './resetar';

let banco: Banco;

comBanco('RNF10 · Reset do banco de demonstração', () => {
  beforeAll(() => {
    banco = bancoDeTeste();
  });
  afterAll(() => banco.$disconnect());
  beforeEach(() => esvaziar(banco));

  it('com dados pré-existentes, apaga tudo e reaplica o seed', async () => {
    const usuarioAntigo = await umUsuario(banco);
    expect(await banco.usuario.count()).toBe(1);

    const resultado = await resetar(banco);

    expect(resultado).toBe('resetado');
    const usuarios = await banco.usuario.findMany({ where: { id: usuarioAntigo.id } });
    expect(usuarios).toHaveLength(0);
  });
});
