import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { voltarAoEntrarNo401 } from './modulos/conduta';
import { roteador } from './roteador';

const clienteDeConsultas: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (erro) => voltarAoEntrarNo401(clienteDeConsultas, erro) }),
  mutationCache: new MutationCache({
    onError: (erro) => voltarAoEntrarNo401(clienteDeConsultas, erro),
  }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider>
      <QueryClientProvider client={clienteDeConsultas}>
        <RouterProvider router={roteador} />
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
