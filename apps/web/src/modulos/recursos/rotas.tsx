import type { RouteObject } from 'react-router';
import { EmConstrucao } from '../../comum/EmConstrucao';

export const rotasRecursos: RouteObject[] = [
  {
    path: 'recursos',
    element: (
      <EmConstrucao
        titulo="Recursos"
        descricao="Busca, agenda e cadastro de Recursos. Chega no Incremento 1."
      />
    ),
  },
];
