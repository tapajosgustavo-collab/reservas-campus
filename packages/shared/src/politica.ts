/** Os limites da Política. Cada um entra aqui no ticket que o usa. */
export const POLITICA = {
  /** RN14: o Check-in abre esses minutos antes do início. */
  checkInAntesDoInicioMin: 15,
  /** RN14: Tolerância, em minutos depois do início. */
  toleranciaMin: 15,
} as const;
