import type { RouteObject } from 'react-router';
import { EmConstrucao } from '../../comum/EmConstrucao';

export const rotasReservas: RouteObject[] = [
  {
    path: 'reservas',
    element: (
      <EmConstrucao
        titulo="Minhas reservas"
        descricao="Reservas ativas e encerradas. Chega no Incremento 1."
      />
    ),
  },
];
