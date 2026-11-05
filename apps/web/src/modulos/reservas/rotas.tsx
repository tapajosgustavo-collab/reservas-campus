import type { RouteObject } from 'react-router';
import { DetalheDaReserva } from './DetalheDaReserva';
import { MinhasReservas } from './MinhasReservas';

export const rotasReservas: RouteObject[] = [
  { path: 'reservas', Component: MinhasReservas },
  { path: 'reservas/:id', Component: DetalheDaReserva },
];
