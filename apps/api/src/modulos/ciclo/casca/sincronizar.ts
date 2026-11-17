import { POLITICA } from '@reservas/shared';
import type { Transacao } from '../../../comum/banco';
import type { Prisma } from '../../../generated/prisma/client';
import { executar as executarEmConduta } from '../../conduta';
import { executar as executarEmReservas } from '../../reservas';
import { sincronizar as sincronizarNucleo, type ReservaDoCiclo } from '../nucleo/sincronizar';
import { executar } from './efeitos';

const MINUTO = 60_000;

const selectReservaCiclo = {
  id: true,
  usuarioId: true,
  usuario: { select: { nome: true } },
  status: true,
  inicio: true,
  fim: true,
  serieId: true,
  recurso: { select: { id: true, nome: true, tipo: true, gestorId: true } },
  penalidade: { select: { id: true } },
} satisfies Prisma.ReservaSelect;

type ReservaLida = Prisma.ReservaGetPayload<{ select: typeof selectReservaCiclo }>;

/** RN17: a Penalidade da Reserva (`reserva_id` único) marca o atraso já penalizado. */
const paraOCiclo = ({ penalidade, ...reserva }: ReservaLida): ReservaDoCiclo => ({
  ...reserva,
  penalizada: penalidade !== null,
});

/**
 * Aplica tudo o que o tempo fez vencer até `agora` (#12, #51) e devolve quantos efeitos gravou.
 * Roda no começo de toda requisição e no tique, sempre dentro da transação e sob o advisory lock.
 * RN12: Pedido não decidido expira no prazo de decisão (2h antes do início).
 * RN15: Confirmada sem Check-in até o fim da Tolerância vira Não comparecimento, com Penalidade.
 * RN17: Equipamento Em uso sem Devolução no fim da Tolerância de Devolução gera uma Penalidade.
 * RN18: Espaço Em uso vira Concluída no fim do Intervalo.
 * RN23: a Reserva seguinte do Equipamento ainda fora é cancelada sem Penalidade, não vira RN15.
 * US16: Reserva Confirmada recebe lembrete 1h antes do início (descartado se já passou do início).
 * ADR 0004: Janela temporal nas consultas evita ler todo o banco sob o lock e descarta lembretes passados.
 */
export async function sincronizar(tx: Transacao, agora: Date): Promise<number> {
  const limiteLembrete = new Date(agora.getTime() + POLITICA.lembreteAntesDoInicioMin * MINUTO);
  const limiteDecisao = new Date(agora.getTime() + POLITICA.prazoDeDecisaoMin * MINUTO);
  const limiteTolerancia = new Date(agora.getTime() - POLITICA.toleranciaMin * MINUTO);
  const limiteDevolucao = new Date(agora.getTime() - POLITICA.toleranciaDeDevolucaoMin * MINUTO);

  // Busca pedidos que atingiram o prazo de decisão, reservas confirmadas na janela de lembrete ou
  // com a Tolerância vencida, Espaços Em uso que já passaram do fim e Equipamentos Em uso que
  // passaram da Tolerância de Devolução sem a Penalidade (RN17).
  const candidatas = await tx.reserva.findMany({
    where: {
      OR: [
        {
          status: 'Pendente',
          inicio: { lte: limiteDecisao },
        },
        {
          status: 'Confirmada',
          inicio: { gt: agora, lte: limiteLembrete },
          notificacoes: { none: { tipo: 'Lembrete' } },
        },
        {
          status: 'Confirmada',
          inicio: { lte: limiteTolerancia },
        },
        {
          status: 'EmUso',
          fim: { lte: agora },
          recurso: { tipo: 'Espaco' },
        },
        {
          status: 'EmUso',
          fim: { lte: limiteDevolucao },
          recurso: { tipo: 'Equipamento' },
          penalidade: { is: null },
        },
      ],
    },
    select: selectReservaCiclo,
  });

  if (candidatas.length === 0) {
    return 0;
  }

  // RN21: Se houver pedidos pendentes de Séries, busca as demais ocorrências pendentes dessas Séries
  // para que o núcleo possa expirar a Série inteira em bloco.
  const seriesIds = Array.from(
    new Set(
      candidatas
        .filter((r) => r.status === 'Pendente' && r.serieId != null)
        .map((r) => r.serieId as number),
    ),
  );

  let reservas: ReservaLida[] = candidatas;

  if (seriesIds.length > 0) {
    const idsJaCarregados = candidatas.map((r) => r.id);
    const outrasOcorrencias = await tx.reserva.findMany({
      where: {
        status: 'Pendente',
        serieId: { in: seriesIds },
        id: { notIn: idsJaCarregados },
      },
      select: selectReservaCiclo,
    });
    if (outrasOcorrencias.length > 0) {
      reservas = [...candidatas, ...outrasOcorrencias];
    }
  }

  // RN23: para a Reserva de Equipamento com a Tolerância vencida, o núcleo precisa ver se a
  // anterior do mesmo Equipamento ainda está Em uso, sem Devolução.
  const equipamentosIds = Array.from(
    new Set(
      candidatas
        .filter((r) => r.status === 'Confirmada' && r.recurso.tipo === 'Equipamento')
        .map((r) => r.recurso.id),
    ),
  );
  if (equipamentosIds.length > 0) {
    const anterioresEmUso = await tx.reserva.findMany({
      where: {
        status: 'EmUso',
        recursoId: { in: equipamentosIds },
        id: { notIn: reservas.map((r) => r.id) },
      },
      select: selectReservaCiclo,
    });
    reservas = [...reservas, ...anterioresEmUso];
  }

  const { efeitos } = sincronizarNucleo(
    { reservas: reservas.map(paraOCiclo), politica: POLITICA },
    agora,
  );

  for (const efeito of efeitos) {
    switch (efeito.evento) {
      case 'StatusMudou':
        await executarEmReservas(tx, efeito);
        break;
      case 'PenalidadeGerada':
        await executarEmConduta(tx, efeito);
        break;
      case 'NotificacaoEmitida':
        await executar(tx, efeito);
        break;
    }
  }

  return efeitos.length;
}
