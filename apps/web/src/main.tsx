import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { roteador } from './roteador';

const clienteDeConsultas = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider>
      <QueryClientProvider client={clienteDeConsultas}>
        <RouterProvider router={roteador} />
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
