import type { RouteObject } from 'react-router';
import { AgendaDoRecurso } from './AgendaDoRecurso';
import { BuscaDeRecursos } from './BuscaDeRecursos';
import { CadastrarRecurso, EditarRecurso } from './CadastroDoRecurso';
import { MeusRecursos } from './MeusRecursos';

export const rotasRecursos: RouteObject[] = [
  // A busca (US06) e "Meus recursos" levam para a agenda.
  { path: 'recursos', Component: BuscaDeRecursos },
  { path: 'recursos/:id/agenda', Component: AgendaDoRecurso },
  // Telas do Gestor (US04). A API recusa os outros Perfis; o menu só mostra para o Gestor.
  { path: 'gestao/recursos', Component: MeusRecursos },
  { path: 'gestao/recursos/novo', Component: CadastrarRecurso },
  { path: 'gestao/recursos/:id/editar', Component: EditarRecurso },
];
