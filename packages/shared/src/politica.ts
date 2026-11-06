import type { TipoRecurso } from './recursos';
import type { Perfil } from './sessao';

/** O Gestor não cria Reservas: a Política de reservar é só de Aluno e Docente. */
export type PerfilQueReserva = Exclude<Perfil, 'Gestor'>;

/** Os limites da Política. Cada um entra aqui no ticket que o usa. */
export const POLITICA = {
  /** RN05: a Antecedência mínima, igual nos dois Perfis. */
  antecedenciaMinimaMin: 60,
  /** RN05: a Antecedência máxima. */
  antecedenciaMaximaDias: { Aluno: 14, Docente: 60 },
  /** RN06: a Duração máxima. */
  duracaoMaximaMin: {
    Espaco: { Aluno: 120, Docente: 240 },
    Equipamento: { Aluno: 240, Docente: 480 },
  },
  /** RN14: o Check-in abre esses minutos antes do início. */
  checkInAntesDoInicioMin: 15,
  /** RN14: Tolerância, em minutos depois do início. */
  toleranciaMin: 15,
} as const satisfies {
  antecedenciaMinimaMin: number;
  antecedenciaMaximaDias: Record<PerfilQueReserva, number>;
  duracaoMaximaMin: Record<TipoRecurso, Record<PerfilQueReserva, number>>;
  checkInAntesDoInicioMin: number;
  toleranciaMin: number;
};

export type Politica = typeof POLITICA;
