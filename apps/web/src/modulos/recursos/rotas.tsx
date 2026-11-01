import type { RouteObject } from 'react-router';
import { EmConstrucao } from '../../comum/EmConstrucao';
import { CadastrarRecurso, EditarRecurso } from './CadastroDoRecurso';
import { MeusRecursos } from './MeusRecursos';

export const rotasRecursos: RouteObject[] = [
  {
    path: 'recursos',
    element: (
      <EmConstrucao
        titulo="Recursos"
        descricao="Busca e agenda de Recursos. Chega no Incremento 1."
      />
    ),
  },
  // Telas do Gestor (US04). A API recusa os outros Perfis; o menu só mostra para o Gestor.
  { path: 'gestao/recursos', Component: MeusRecursos },
  { path: 'gestao/recursos/novo', Component: CadastrarRecurso },
  { path: 'gestao/recursos/:id/editar', Component: EditarRecurso },
];
