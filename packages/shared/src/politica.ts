import type { Perfil } from './sessao';

/** O Gestor não cria Reservas: a Política de reservar é só de Aluno e Docente. */
export type PerfilQueReserva = Exclude<Perfil, 'Gestor'>;

/** Os limites da Política. Cada um entra aqui no ticket que o usa. */
export const POLITICA = {
  /** RN07: quantas Reservas ativas cada Perfil pode ter (a Série conta como 1, RN21). */
  cota: { Aluno: 3, Docente: 10 },
  /** RN14: o Check-in abre esses minutos antes do início. */
  checkInAntesDoInicioMin: 15,
  /** RN14: Tolerância, em minutos depois do início. */
  toleranciaMin: 15,
} as const satisfies {
  cota: Record<PerfilQueReserva, number>;
  checkInAntesDoInicioMin: number;
  toleranciaMin: number;
};

export type Politica = typeof POLITICA;
