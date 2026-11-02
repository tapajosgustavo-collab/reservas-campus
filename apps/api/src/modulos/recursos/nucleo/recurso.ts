import {
  violacao,
  type CadastrarRecurso,
  type EditarRecurso,
  type Perfil,
  type Violacao,
} from '@reservas/shared';

/** O Usuário da sessão. */
export interface Quem {
  id: number;
  perfil: Perfil;
}

/** O que o núcleo precisa saber do Recurso já cadastrado. */
export interface RecursoCadastrado {
  id: number;
  gestorId: number;
}

export type Efeito =
  | { evento: 'RecursoCadastrado'; recurso: CadastrarRecurso & { gestorId: number } }
  | { evento: 'RecursoEditado'; recursoId: number; edicao: EditarRecurso };

export interface Aceita {
  tipo: 'aceita';
  efeitos: Efeito[];
}

export type Decisao = Aceita | { tipo: 'recusada'; violacoes: Violacao[] };

/**
 * US04: cadastrar um Recurso. RN13: quem cadastra é o Gestor responsável. Não há RN que recuse:
 * o Perfil é da casca, e a forma (campos por tipo, Horário) é do Zod.
 */
export function decidirCadastro(recurso: CadastrarRecurso, quem: Quem): Aceita {
  return {
    tipo: 'aceita',
    efeitos: [{ evento: 'RecursoCadastrado', recurso: { ...recurso, gestorId: quem.id } }],
  };
}

/** US04: editar um Recurso. RN13: só o Gestor responsável. */
export function decidirEdicao(
  recurso: RecursoCadastrado,
  edicao: EditarRecurso,
  quem: Quem,
): Decisao {
  if (quem.id === recurso.gestorId) {
    return {
      tipo: 'aceita',
      efeitos: [{ evento: 'RecursoEditado', recursoId: recurso.id, edicao }],
    };
  }
  return {
    tipo: 'recusada',
    violacoes: [violacao('RN13', 'Só o Gestor responsável por este Recurso pode editá-lo.')],
  };
}
