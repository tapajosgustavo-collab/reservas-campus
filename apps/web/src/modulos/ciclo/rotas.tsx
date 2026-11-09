import type { RouteObject } from 'react-router';
import { EmConstrucao } from '../../comum/EmConstrucao';
import { EmUso } from './EmUso';

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
  // US14: só o Gestor vê os seus Equipamentos Em uso e registra a Devolução; a API recusa os outros.
  { path: 'gestao/em-uso', Component: EmUso },
];
