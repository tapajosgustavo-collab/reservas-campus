import {
  STATUS_DO_ERRO,
  type CodigoErro,
  type RespostaErro,
  type Violacao,
} from '@reservas/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { ehConflitoNoBanco } from './banco';

/** Erro que a casca lança para responder com o envelope único (ADR 0001). */
export class ErroApi extends Error {
  constructor(
    readonly codigo: CodigoErro,
    mensagem: string,
    readonly violacoes: Violacao[] = [],
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

/** 422 com todas as RNs que o núcleo devolveu. */
export function regraViolada(violacoes: Violacao[]) {
  const quantas = violacoes.length === 1 ? '1 regra impede' : `${violacoes.length} regras impedem`;
  return new ErroApi(
    'regra_violada',
    `Não foi possível concluir: ${quantas} a operação.`,
    violacoes,
  );
}

function envelope(erro: ErroApi): RespostaErro {
  return { erro: { codigo: erro.codigo, mensagem: erro.message, violacoes: erro.violacoes } };
}

function paraErroApi(erro: FastifyError): ErroApi {
  if (erro instanceof ErroApi) return erro;
  if (hasZodFastifySchemaValidationErrors(erro)) {
    const campos = erro.validation.map(({ instancePath, message }) =>
      instancePath ? `${instancePath.slice(1).replaceAll('/', '.')}: ${message}` : message,
    );
    return new ErroApi('entrada_invalida', `Entrada inválida: ${campos.join('; ')}`);
  }
  if (ehConflitoNoBanco(erro)) {
    return new ErroApi(
      'conflito_concorrente',
      'Outra Reserva ocupou este Intervalo ao mesmo tempo. Atualize a agenda e tente de novo.',
    );
  }
  // Erros do próprio Fastify (JSON malformado, corpo grande demais, tipo de conteúdo errado...).
  if (erro.statusCode && erro.statusCode >= 400 && erro.statusCode < 500) {
    return new ErroApi('entrada_invalida', erro.message);
  }
  return new ErroApi('erro_interno', 'Erro inesperado no servidor. Tente de novo.');
}

/** Toda resposta de erro da API sai no envelope `{ erro: { codigo, mensagem, violacoes } }`. */
export function registrarErros(app: FastifyInstance) {
  app.setErrorHandler((erro: FastifyError, request, reply) => {
    const erroApi = paraErroApi(erro);
    if (erroApi.codigo === 'erro_interno') request.log.error(erro);
    else if (erroApi.codigo === 'regra_violada') {
      request.log.info({ rns: erroApi.violacoes.map((v) => v.rn) }, 'regra_violada');
    }
    return reply.status(STATUS_DO_ERRO[erroApi.codigo]).send(envelope(erroApi));
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .status(404)
      .send(
        envelope(
          new ErroApi('nao_encontrado', `Rota não encontrada: ${request.method} ${request.url}`),
        ),
      ),
  );
}
