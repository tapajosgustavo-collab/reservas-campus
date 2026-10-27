import type { RouteObject } from 'react-router';
import { EmConstrucao } from '../../comum/EmConstrucao';

export const rotasCiclo: RouteObject[] = [
  {
    path: 'gestao/pedidos',
    element: (
      <EmConstrucao
        titulo="Pedidos"
        descricao="Fila de Pedidos dos Recursos restritos. Chega no Incremento 3."
      />
    ),
  },
];
