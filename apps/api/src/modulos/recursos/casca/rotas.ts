import {
  esquemaAgenda,
  esquemaBuscarAgenda,
  esquemaBuscarRecursos,
  esquemaCadastrarRecurso,
  esquemaEditarRecurso,
  esquemaIdDoRecurso,
  esquemaRecurso,
  esquemaRecursos,
} from '@reservas/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ErroApi, proibidoPelaRegra } from '../../../comum/erros';
import { limitesDaSemana, paraIsoSaoPaulo, segundaDaSemana } from '../../../comum/instante';
import { exigirPerfil, exigirSessao } from '../../../comum/sessao';
import { agendaPara } from '../nucleo/agenda';
import { decidirCadastro, decidirEdicao, type Efeito } from '../nucleo/recurso';
import { executar } from './efeitos';

const COLUNAS_DO_RESUMO = {
  id: true,
  tipo: true,
  nome: true,
  local: true,
  capacidade: true,
  patrimonio: true,
} as const;

const COLUNAS_DO_RECURSO = {
  ...COLUNAS_DO_RESUMO,
  gestor: { select: { id: true, nome: true } },
  horarios: {
    select: { diaSemana: true, abre: true, fecha: true },
    orderBy: { diaSemana: 'asc' },
  },
} as const;

function naoEncontrado(id: number) {
  return new ErroApi('nao_encontrado', `Recurso ${id} não encontrado.`);
}

async function buscarRecurso(request: FastifyRequest, id: number) {
  const recurso = await request.tx.recurso.findUnique({
    where: { id },
    select: COLUNAS_DO_RECURSO,
  });
  if (!recurso) throw naoEncontrado(id);
  return recurso;
}

/** Executa os efeitos de uma decisão aceita e devolve o id do Recurso. */
async function aplicar(request: FastifyRequest, efeitos: Efeito[]) {
  let recursoId = 0;
  for (const efeito of efeitos) {
    recursoId = await executar(request.tx, efeito);
    request.log.info({ evento: efeito.evento, recursoId }, efeito.evento);
  }
  return recursoId;
}

/** Rotas do M2 do incremento 1: cadastrar, editar, ver e "Meus recursos" (US04), e a agenda (US07). */
export function registrarRotasDeRecursos(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.post(
    '/api/recursos',
    {
      schema: {
        summary: 'Cadastra um Espaço ou Equipamento; quem cadastra é o Gestor responsável',
        tags: ['recursos'],
        body: esquemaCadastrarRecurso,
        response: { 201: esquemaRecurso },
      },
    },
    async (request, reply) => {
      const quem = await exigirPerfil(request, 'Gestor');
      const { body } = request;
      if (body.tipo === 'Equipamento') {
        const outro = await request.tx.recurso.findUnique({
          where: { patrimonio: body.patrimonio },
          select: { id: true },
        });
        if (outro) {
          throw new ErroApi(
            'entrada_invalida',
            `Já existe um Equipamento com o patrimônio ${body.patrimonio}.`,
          );
        }
      }
      const recursoId = await aplicar(request, decidirCadastro(body, quem).efeitos);
      reply.status(201);
      return buscarRecurso(request, recursoId);
    },
  );

  rotas.patch(
    '/api/recursos/:id',
    {
      schema: {
        summary: 'Edita um Recurso (só o Gestor responsável); tipo e patrimônio não mudam',
        tags: ['recursos'],
        params: esquemaIdDoRecurso,
        body: esquemaEditarRecurso,
        response: { 200: esquemaRecurso },
      },
    },
    async (request) => {
      const quem = await exigirPerfil(request, 'Gestor');
      const { id } = request.params;
      const recurso = await request.tx.recurso.findUnique({
        where: { id },
        select: { id: true, tipo: true, gestorId: true },
      });
      if (!recurso) throw naoEncontrado(id);
      const decisao = decidirEdicao(recurso, request.body, quem);
      if (decisao.tipo === 'recusada') throw proibidoPelaRegra(decisao.violacoes);
      if (recurso.tipo === 'Equipamento' && request.body.capacidade !== undefined) {
        throw new ErroApi('entrada_invalida', 'Equipamento não tem Capacidade.');
      }
      if (recurso.tipo === 'Espaco' && request.body.local === null) {
        throw new ErroApi('entrada_invalida', 'Espaço precisa de local.');
      }
      await aplicar(request, decisao.efeitos);
      return buscarRecurso(request, recurso.id);
    },
  );

  rotas.get(
    '/api/recursos/:id',
    {
      schema: {
        summary: 'Mostra um Recurso com o Horário de funcionamento e o Gestor responsável',
        tags: ['recursos'],
        params: esquemaIdDoRecurso,
        response: { 200: esquemaRecurso },
      },
    },
    async (request) => {
      await exigirSessao(request);
      return buscarRecurso(request, request.params.id);
    },
  );

  rotas.get(
    '/api/recursos',
    {
      schema: {
        summary: 'Lista os Recursos; com gestor=eu, só os do Gestor da sessão ("Meus recursos")',
        tags: ['recursos'],
        querystring: esquemaBuscarRecursos,
        response: { 200: esquemaRecursos },
      },
    },
    async (request) => {
      const quem = await exigirSessao(request);
      return request.tx.recurso.findMany({
        where: request.query.gestor === 'eu' ? { gestorId: quem.id } : {},
        select: COLUNAS_DO_RESUMO,
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      });
    },
  );
  rotas.get(
    '/api/recursos/:id/agenda',
    {
      schema: {
        summary: 'Agenda da semana do Recurso; de quem não é o dono, só o Intervalo (RN22)',
        tags: ['recursos'],
        params: esquemaIdDoRecurso,
        querystring: esquemaBuscarAgenda,
        response: { 200: esquemaAgenda },
      },
    },
    async (request) => {
      const quem = await exigirSessao(request);
      const recurso = await buscarRecurso(request, request.params.id);
      const semana = request.query.semana ?? segundaDaSemana(request.agora);
      const { inicio, fim } = limitesDaSemana(semana);
      // Todas as Reservas que tocam a semana: quem escolhe as ativas é o núcleo.
      const reservas = await request.tx.reserva.findMany({
        where: { recursoId: recurso.id, inicio: { lt: fim }, fim: { gt: inicio } },
        select: { id: true, usuarioId: true, inicio: true, fim: true, status: true },
        orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
      });
      const agenda = agendaPara(quem, {
        agora: request.agora,
        recurso,
        // A Indisponibilidade entra na agenda com o #45; até lá, nenhuma.
        indisponibilidades: [],
        reservas,
      });
      return {
        ...agenda,
        agora: paraIsoSaoPaulo(agenda.agora),
        semana,
        indisponibilidades: agenda.indisponibilidades.map((indisponibilidade) => ({
          ...indisponibilidade,
          inicio: paraIsoSaoPaulo(indisponibilidade.inicio),
          fim: indisponibilidade.fim && paraIsoSaoPaulo(indisponibilidade.fim),
        })),
        ocupacoes: agenda.ocupacoes.map((ocupacao) => ({
          ...ocupacao,
          inicio: paraIsoSaoPaulo(ocupacao.inicio),
          fim: paraIsoSaoPaulo(ocupacao.fim),
        })),
      };
    },
  );
}
