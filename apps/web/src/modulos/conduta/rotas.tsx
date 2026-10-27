import type { RouteObject } from 'react-router';
import { EmConstrucao } from '../../comum/EmConstrucao';

export const rotasConduta: RouteObject[] = [
  {
    path: 'conduta',
    element: (
      <EmConstrucao
        titulo="Minha conduta"
        descricao="Penalidades e Suspensão. Chega no Incremento 4."
      />
    ),
  },
];
