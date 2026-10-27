import { z } from 'zod';

/** Código de cada erro da API e o status HTTP dele (ADR 0001). */
export const STATUS_DO_ERRO = {
  entrada_invalida: 400,
  nao_autenticado: 401,
  proibido: 403,
  nao_encontrado: 404,
  conflito_concorrente: 409,
  regra_violada: 422,
  erro_interno: 500,
} as const;

export type CodigoErro = keyof typeof STATUS_DO_ERRO;

export const esquemaViolacao = z.object({
  rn: z.string().regex(/^RN\d{2}$/),
  nome: z.string(),
  mensagem: z.string(),
  campo: z.string().optional(),
  data: z.iso.date().optional().describe('Só na Série: a data da Ocorrência que viola a regra'),
});

export type Violacao = z.infer<typeof esquemaViolacao>;

/** Envelope único de erro de todas as rotas. */
export const esquemaErro = z.object({
  erro: z.object({
    codigo: z.enum(Object.keys(STATUS_DO_ERRO) as [CodigoErro, ...CodigoErro[]]),
    mensagem: z.string(),
    violacoes: z.array(esquemaViolacao),
  }),
});

export type RespostaErro = z.infer<typeof esquemaErro>;
