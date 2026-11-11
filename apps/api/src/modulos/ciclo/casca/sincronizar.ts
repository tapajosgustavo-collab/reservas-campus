import type { Transacao } from '../../../comum/banco';
import { executar as executarEmReservas } from '../../reservas';
import { sincronizar as sincronizarNucleo, type ReservaDoCiclo } from '../nucleo/sincronizar';
import { executar } from './efeitos';

/**
 * Aplica tudo o que o tempo fez vencer até `agora` (#12, #51) e devolve quantos efeitos gravou.
 * Roda no começo de toda requisição e no tique, sempre dentro da transação e sob o advisory lock.
 * RN12: Pedido não decidido expira 2h antes do início.
 * US16: Reserva Confirmada recebe lembrete 1h antes do início (descartado se já passou do início).
 */
export async function sincronizar(tx: Transacao, agora: Date): Promise<number> {
  const [pendentes, confirmadas] = await Promise.all([
    tx.reserva.findMany({
      where: { status: 'Pendente' },
      select: {
        id: true,
        usuarioId: true,
        status: true,
        inicio: true,
        fim: true,
        serieId: true,
        recurso: { select: { nome: true } },
      },
    }),
    tx.reserva.findMany({
      where: {
        status: 'Confirmada',
        notificacoes: { none: { tipo: 'Lembrete' } },
      },
      select: {
        id: true,
        usuarioId: true,
        status: true,
        inicio: true,
        fim: true,
        serieId: true,
        recurso: { select: { nome: true } },
      },
    }),
  ]);

  if (pendentes.length === 0 && confirmadas.length === 0) {
    return 0;
  }

  const reservas: ReservaDoCiclo[] = [
    ...pendentes.map((r) => ({ ...r, jaLembrou: false })),
    ...confirmadas.map((r) => ({ ...r, jaLembrou: false })),
  ];

  const { efeitos } = sincronizarNucleo({ reservas }, agora);

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
