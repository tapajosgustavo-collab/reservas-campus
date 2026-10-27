import { createBrowserRouter } from 'react-router';
import { EmConstrucao } from './comum/EmConstrucao';
import { Inicio } from './comum/Inicio';
import { Layout } from './comum/Layout';
import { rotasCiclo } from './modulos/ciclo';
import { rotasConduta } from './modulos/conduta';
import { rotasRecursos } from './modulos/recursos';
import { rotasReservas } from './modulos/reservas';

export const roteador = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Inicio },
      ...rotasConduta,
      ...rotasRecursos,
      ...rotasReservas,
      ...rotasCiclo,
      {
        path: '*',
        element: <EmConstrucao titulo="Página não encontrada" descricao="Confira o endereço." />,
      },
    ],
  },
]);
