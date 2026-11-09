import type { TipoRecurso } from './recursos';
import type { Perfil } from './sessao';

/** O Gestor não cria Reservas: a Política de reservar é só de Aluno e Docente. */
export type PerfilQueReserva = Exclude<Perfil, 'Gestor'>;

/**
 * O formato da Política, com `number` e não os literais do `POLITICA`: assim um teste pode passar
 * uma Política com outros limites e conferir que a regra os lê dela.
 */
export interface Politica {
  /** RN05: a Antecedência mínima, igual nos dois Perfis. */
  antecedenciaMinimaMin: number;
  /** RN05: a Antecedência máxima. */
  antecedenciaMaximaDias: Record<PerfilQueReserva, number>;
  /** RN06: a Duração máxima. */
  duracaoMaximaMin: Record<TipoRecurso, Record<PerfilQueReserva, number>>;
  /** RN07: quantas Reservas ativas cada Perfil pode ter (a Série conta como 1, RN21). */
  cota: Record<PerfilQueReserva, number>;
  /** RN14: o Check-in abre esses minutos antes do início. */
  checkInAntesDoInicioMin: number;
  /** RN14: Tolerância, em minutos depois do início. */
  toleranciaMin: number;
}

/** Os limites da Política. Cada um entra aqui no ticket que o usa. */
export const POLITICA = {
  antecedenciaMinimaMin: 60,
  antecedenciaMaximaDias: { Aluno: 14, Docente: 60 },
  duracaoMaximaMin: {
    Espaco: { Aluno: 120, Docente: 240 },
    Equipamento: { Aluno: 240, Docente: 480 },
  },
  cota: { Aluno: 3, Docente: 10 },
  checkInAntesDoInicioMin: 15,
  toleranciaMin: 15,
} as const satisfies Politica;
