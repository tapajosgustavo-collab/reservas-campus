import { esquemaCriarReserva, esquemaReserva } from '@reservas/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ErroApi, regraViolada } from '../../../comum/erros';
import { paraIsoSaoPaulo } from '../../../comum/instante';
import { exigirPerfil } from '../../../comum/sessao';
import { decidirReserva } from '../nucleo/reservar';
import { executar } from './efeitos';

/** Rotas do M3 do incremento 1: reservar (US08). */
export function registrarRotasDeReservas(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.post(
    '/api/reservas',
    {
      schema: {
        summary: 'Reserva um Recurso num Intervalo; recusa com todas as RNs violadas',
        tags: ['reservas'],
        body: esquemaCriarReserva,
        response: { 201: esquemaReserva },
      },
    },
    async (request, reply) => {
      const quem = await exigirPerfil(request, 'Aluno', 'Docente');
      const { body, tx, agora } = request;
      const recurso = await tx.recurso.findUnique({
        where: { id: body.recursoId },
        select: { tipo: true, horarios: { select: { diaSemana: true, abre: true, fecha: true } } },
      });
      if (!recurso) {
        throw new ErroApi('nao_encontrado', `Recurso ${body.recursoId} não encontrado.`);
      }
      if (recurso.tipo === 'Equipamento' && body.participantes !== undefined) {
        throw new ErroApi('entrada_invalida', 'Equipamento não tem Participantes.');
      }

      const pedido = { ...body, inicio: new Date(body.inicio), fim: new Date(body.fim) };
      // Todas as Reservas em volta do Intervalo: quem escolhe as ativas é o núcleo.
      const reservasDoRecurso = await tx.reserva.findMany({
        where: {
          recursoId: body.recursoId,
          inicio: { lt: pedido.fim },
          fim: { gt: pedido.inicio },
        },
        select: { inicio: true, fim: true, status: true },
        orderBy: { inicio: 'asc' },
      });
      const decisao = decidirReserva(
        { horarios: recurso.horarios, reservasDoRecurso },
        pedido,
        quem,
        agora,
      );
      if (decisao.tipo === 'recusada') throw regraViolada(decisao.violacoes);

      const [efeito] = decisao.efeitos;
      const reserva = await executar(tx, efeito);
      request.log.info({ evento: efeito.evento, reservaId: reserva.id }, efeito.evento);
      reply.status(201);
      return {
        ...reserva,
        inicio: paraIsoSaoPaulo(reserva.inicio),
        fim: paraIsoSaoPaulo(reserva.fim),
        criadaEm: paraIsoSaoPaulo(reserva.criadaEm),
      };
    },
  );
}
