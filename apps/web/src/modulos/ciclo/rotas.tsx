import type { RouteObject } from 'react-router';
import { EmUso } from './EmUso';
import { FilaDePedidos } from './FilaDePedidos';

export const rotasCiclo: RouteObject[] = [
  // US11: só o Gestor vê a fila dos Pedidos dos seus Recursos e decide; a API recusa os outros.
  { path: 'gestao/pedidos', Component: FilaDePedidos },
  // US14: só o Gestor vê os seus Equipamentos Em uso e registra a Devolução; a API recusa os outros.
  { path: 'gestao/em-uso', Component: EmUso },
];
