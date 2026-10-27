import type { Banco } from '../comum/banco';

/**
 * Dados de demonstração (RNF10, #18). Só roda com o banco vazio, para nunca misturar com o que já existe.
 * Ainda vazio: as cenas de cada incremento entram nos tickets "cenas da demo no seed".
 */
export async function semear(banco: Banco): Promise<'semeado' | 'ignorado'> {
  return banco.$transaction(async (tx) => {
    // Toda linha do banco leva a um Usuário (Recurso pelo Gestor, Reserva pelo dono...),
    // então sem Usuário o banco está vazio.
    if ((await tx.usuario.count()) > 0) return 'ignorado';
    return 'semeado';
  });
}
