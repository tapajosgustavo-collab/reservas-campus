import type { Banco } from '../comum/banco';

// Os Usuários do "Entrar como…" (#18). `<nome>.demo@unifesp.br` porque o repositório é público e
// `nome.sobrenome@unifesp.br` pode ser de uma pessoa real.
const USUARIOS = [
  { nome: 'Ana Souza', email: 'ana.demo@unifesp.br', perfil: 'Aluno' },
  { nome: 'Bruno Lima', email: 'bruno.demo@unifesp.br', perfil: 'Aluno' },
  { nome: 'Bia Santos', email: 'bia.demo@unifesp.br', perfil: 'Aluno' },
  { nome: 'Eduardo Prado', email: 'eduardo.demo@unifesp.br', perfil: 'Docente' },
  { nome: 'Carlos Mendes', email: 'carlos.demo@unifesp.br', perfil: 'Gestor' },
  { nome: 'Dora Alves', email: 'dora.demo@unifesp.br', perfil: 'Gestor' },
] as const;

/**
 * Dados de demonstração (RNF10, #18). Só roda com o banco vazio, para nunca misturar com o que já existe.
 * Por enquanto só os Usuários: as cenas de cada incremento entram nos tickets "cenas da demo no seed".
 */
export async function semear(banco: Banco): Promise<'semeado' | 'ignorado'> {
  return banco.$transaction(async (tx) => {
    // Toda linha do banco leva a um Usuário (Recurso pelo Gestor, Reserva pelo dono...),
    // então sem Usuário o banco está vazio.
    if ((await tx.usuario.count()) > 0) return 'ignorado';
    await tx.usuario.createMany({ data: [...USUARIOS] });
    return 'semeado';
  });
}
