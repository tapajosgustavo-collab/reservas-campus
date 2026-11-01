import { describe, expect, it } from 'vitest';
import { decidirEntrada, normalizarEmail } from './entrar';

const ana = { id: 7, email: 'ana.demo@unifesp.br' };

describe('US01 · Entrar no sistema', () => {
  it('e-mail @unifesp.br cadastrado → aceita, com o Usuário dele', () => {
    expect(decidirEntrada('ana.demo@unifesp.br', ana)).toEqual({ tipo: 'aceita', usuarioId: 7 });
  });

  it.each(['ana.demo@gmail.com', 'ana.demo@unifesp.br.com', 'ana.demo@aluno.unifesp.br', 'ana'])(
    '%s → recusada: só e-mails @unifesp.br',
    (email) => {
      expect(decidirEntrada(email, null)).toEqual({
        tipo: 'recusada',
        mensagem: 'US01 · Só e-mails @unifesp.br entram no sistema.',
      });
    },
  );

  it('e-mail @unifesp.br que não está cadastrado → recusada', () => {
    expect(decidirEntrada('zeca.demo@unifesp.br', null)).toEqual({
      tipo: 'recusada',
      mensagem:
        'US01 · O e-mail zeca.demo@unifesp.br não está cadastrado. Escolha alguém em "Entrar como…".',
    });
  });

  it('o e-mail vale sem diferença de maiúsculas e sem espaços nas pontas', () => {
    expect(normalizarEmail('  Ana.Demo@UNIFESP.br ')).toBe('ana.demo@unifesp.br');
  });
});
