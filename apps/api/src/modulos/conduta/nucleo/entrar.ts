/** O Usuário que a casca achou pelo e-mail. */
export interface UsuarioCadastrado {
  id: number;
  email: string;
}

// A US01 não tem RN própria: a recusa cita a história, e a violação vai sem `rn`.
export type DecisaoDeEntrada =
  { tipo: 'aceita'; usuarioId: number } | { tipo: 'recusada'; mensagem: string };

/** O e-mail como fica no cadastro: a casca busca o Usuário por ele. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** US01: quem entra e com qual Usuário. O `email` já vem normalizado. */
export function decidirEntrada(email: string, usuario: UsuarioCadastrado | null): DecisaoDeEntrada {
  if (!/^[^@\s]+@unifesp\.br$/.test(email)) {
    return { tipo: 'recusada', mensagem: 'US01 · Só e-mails @unifesp.br entram no sistema.' };
  }
  if (!usuario) {
    return {
      tipo: 'recusada',
      mensagem: `US01 · O e-mail ${email} não está cadastrado. Escolha alguém em "Entrar como…".`,
    };
  }
  return { tipo: 'aceita', usuarioId: usuario.id };
}
