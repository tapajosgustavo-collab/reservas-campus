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

  it('traz os seis Usuários de demonstração do "Entrar como…" (#18)', async () => {
    await semear(banco);

    const usuarios = await banco.usuario.findMany({
      select: { nome: true, email: true, perfil: true },
      orderBy: { email: 'asc' },
    });
    expect(usuarios).toEqual([
      { nome: 'Ana Souza', email: 'ana.demo@unifesp.br', perfil: 'Aluno' },
      { nome: 'Bia Santos', email: 'bia.demo@unifesp.br', perfil: 'Aluno' },
      { nome: 'Bruno Lima', email: 'bruno.demo@unifesp.br', perfil: 'Aluno' },
      { nome: 'Carlos Mendes', email: 'carlos.demo@unifesp.br', perfil: 'Gestor' },
      { nome: 'Dora Alves', email: 'dora.demo@unifesp.br', perfil: 'Gestor' },
      { nome: 'Eduardo Prado', email: 'eduardo.demo@unifesp.br', perfil: 'Docente' },
    ]);
  });

  it('com dados no banco, não toca em nada', async () => {
    const existente = await umUsuario(banco);

    expect(await semear(banco)).toBe('ignorado');
    expect(await banco.usuario.findMany()).toEqual([existente]);
  });
});
