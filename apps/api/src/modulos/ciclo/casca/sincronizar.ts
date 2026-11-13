import { POLITICA } from '@reservas/shared';
import type { Transacao } from '../../../comum/banco';
import { executar as executarEmReservas } from '../../reservas';
import { sincronizar as sincronizarNucleo, type ReservaDoCiclo } from '../nucleo/sincronizar';
import { executar } from './efeitos';

const MINUTO = 60_000;

const selectReservaCiclo = {
  id: true,
  usuarioId: true,
  status: true,
  inicio: true,
  fim: true,
  serieId: true,
  recurso: { select: { nome: true } },
} as const;

/**
 * Aplica tudo o que o tempo fez vencer até `agora` (#12, #51) e devolve quantos efeitos gravou.
 * Roda no começo de toda requisição e no tique, sempre dentro da transação e sob o advisory lock.
 * RN12: Pedido não decidido expira no prazo de decisão (2h antes do início).
 * US16: Reserva Confirmada recebe lembrete 1h antes do início (descartado se já passou do início).
 * ADR 0004: Janela temporal nas consultas evita ler todo o banco sob o lock e descarta lembretes passados.
 */
export async function sincronizar(tx: Transacao, agora: Date): Promise<number> {
  const limiteLembrete = new Date(agora.getTime() + POLITICA.lembreteAntesDoInicioMin * MINUTO);
  const limiteDecisao = new Date(agora.getTime() + POLITICA.prazoDeDecisaoMin * MINUTO);

  // Busca pedidos que atingiram o prazo de decisão e reservas confirmadas na janela de lembrete
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

  let reservas: ReservaDoCiclo[] = candidatas;

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

  const { efeitos } = sincronizarNucleo({ reservas, politica: POLITICA }, agora);

  for (const efeito of efeitos) {
    switch (efeito.evento) {
      case 'StatusMudou':
        await executarEmReservas(tx, efeito);
        break;
      case 'NotificacaoEmitida':
        await executar(tx, efeito);
        break;
    }
  }

  return efeitos.length;
}
