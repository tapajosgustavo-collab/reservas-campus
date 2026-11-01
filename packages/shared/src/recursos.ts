import { z } from 'zod';

const MINUTOS_DO_DIA = 24 * 60;

/** Minutos desde 0h em São Paulo, de meia em meia hora. */
const minutosDoDia = z
  .number()
  .int()
  .min(0)
  .max(MINUTOS_DO_DIA)
  .multipleOf(30, { error: 'use múltiplos de 30 minutos' });

export const esquemaTipoRecurso = z.enum(['Espaco', 'Equipamento']);

export type TipoRecurso = z.infer<typeof esquemaTipoRecurso>;

/** Uma faixa do Horário de funcionamento. Dia sem faixa = fechado. */
export const esquemaHorario = z
  .strictObject({
    diaSemana: z.number().int().min(0).max(6).describe('0 = domingo, 6 = sábado'),
    abre: minutosDoDia.describe('Minutos desde 0h em São Paulo, múltiplo de 30'),
    fecha: minutosDoDia.describe(
      'Minutos desde 0h em São Paulo, múltiplo de 30; 1440 = meia-noite',
    ),
  })
  .refine(({ abre, fecha }) => abre < fecha, {
    error: 'fecha precisa ser depois de abre',
    path: ['fecha'],
  });

export type Horario = z.infer<typeof esquemaHorario>;

/** O Horário de funcionamento inteiro: no máximo uma faixa por dia da semana. */
export const esquemaHorarios = z
  .array(esquemaHorario)
  .max(7)
  .refine((horarios) => new Set(horarios.map((h) => h.diaSemana)).size === horarios.length, {
    error: 'no máximo uma faixa por dia da semana',
  });

const nome = z.string().trim().min(1).max(120);
const local = z.string().trim().min(1).max(120);
const capacidade = z.number().int().min(1).max(10_000);

// Só a forma (ADR 0001). O `restrito` entra no incremento 3 (#47).
export const esquemaCadastrarRecurso = z.discriminatedUnion('tipo', [
  z.strictObject({
    tipo: z.literal('Espaco'),
    nome,
    local,
    capacidade,
    horarios: esquemaHorarios,
  }),
  z.strictObject({
    tipo: z.literal('Equipamento'),
    nome,
    local: local.optional(),
    patrimonio: z.string().trim().min(1).max(40).describe('Número de patrimônio, único'),
    horarios: esquemaHorarios,
  }),
]);

export type CadastrarRecurso = z.infer<typeof esquemaCadastrarRecurso>;

/** Tudo menos `tipo` e `patrimonio`, que não mudam. Os `horarios` vêm inteiros. */
export const esquemaEditarRecurso = z.strictObject({
  nome: nome.optional(),
  local: local.nullable().optional().describe('`null` apaga; só Equipamento fica sem local'),
  capacidade: capacidade.optional().describe('Só Espaço'),
  horarios: esquemaHorarios.optional(),
});

export type EditarRecurso = z.infer<typeof esquemaEditarRecurso>;

export const esquemaResumoDoRecurso = z.object({
  id: z.number().int(),
  tipo: esquemaTipoRecurso,
  nome: z.string(),
  local: z.string().nullable(),
  capacidade: z.number().int().nullable(),
  patrimonio: z.string().nullable(),
});

export type ResumoDoRecurso = z.infer<typeof esquemaResumoDoRecurso>;

export const esquemaRecurso = esquemaResumoDoRecurso.extend({
  gestor: z.object({ id: z.number().int(), nome: z.string() }).describe('Gestor responsável'),
  horarios: z.array(esquemaHorario).describe('Por dia da semana; dia fora da lista = fechado'),
});

export type Recurso = z.infer<typeof esquemaRecurso>;

export const esquemaRecursos = z.array(esquemaResumoDoRecurso);

export const esquemaBuscarRecursos = z.object({
  gestor: z.literal('eu').optional().describe('"Meus recursos": só os do Gestor da sessão'),
});

// O id é INT4 no banco: maior que isso nem chega ao Prisma.
export const esquemaIdDoRecurso = z.object({
  id: z.coerce.number().int().positive().max(2_147_483_647),
});
