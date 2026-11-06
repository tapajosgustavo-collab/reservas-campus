import type { Violacao } from '@reservas/shared';

/** Como toda tela mostra uma RN violada (RNF09): `RNxx · Nome: mensagem`. */
export function linhaDaViolacao({ rn, nome, mensagem }: Violacao) {
  return `${rn} · ${nome}: ${mensagem}`;
}
