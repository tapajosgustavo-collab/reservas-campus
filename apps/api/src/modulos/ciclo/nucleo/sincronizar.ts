import { type Status } from '@reservas/shared';
import { horaEmSaoPaulo, intervaloEmSaoPaulo } from '../../../comum/instante';
import type { StatusMudou } from '../../reservas';
import type { NotificacaoEmitida } from './notificacao';
import { prazoDeDecisao } from './pedido';

const MINUTO = 60_000;

export interface ReservaDoCiclo {
  id: number;
  usuarioId: number;
  status: Status;
  inicio: Date;
  fim: Date;
  recurso: { nome: string };
  serieId?: number | null;
}

export interface PoliticaDoCiclo {
  prazoDeDecisaoMin: number;
  lembreteAntesDoInicioMin: number;
}

export interface Mundo {
  reservas: ReservaDoCiclo[];
  politica: PoliticaDoCiclo;
}

export type RegraVencimento = 'RN12' | 'US16';
export type TipoVencimento = 'Expiracao' | 'Lembrete';

export interface Vencimento {
  em: Date;
  regra: RegraVencimento;
  tipo: TipoVencimento;
  reserva: ReservaDoCiclo;
}

export type EfeitoCiclo = StatusMudou | NotificacaoEmitida;

/** ADR 0004: ordem fixa de desempate no mesmo instante: RN17 → RN12 → RN15 → RN23 → RN18 → RN19 → lembrete. */
const PRIORIDADE_REGRA: Record<RegraVencimento, number> = {
  RN12: 2,
  US16: 7,
};

/** Mapeia o início da primeira ocorrência para séries com pedidos pendentes (RN21/RN12). */
function primeiroInicioDasSeries(reservas: readonly ReservaDoCiclo[]): Map<number, number> {
  const mapa = new Map<number, number>();
  for (const r of reservas) {
    if (r.status === 'Pendente' && r.serieId != null) {
      const atual = mapa.get(r.serieId);
      const inicioTempo = r.inicio.getTime();
      if (atual === undefined || inicioTempo < atual) {
        mapa.set(r.serieId, inicioTempo);
      }
    }
  }
  return mapa;
}

/**
 * ADR 0004: lista todos os vencimentos ainda não aplicados no mundo, em ordem cronológica
 * com desempate por prioridade de regra e id da Reserva.
 */
export function vencimentos(mundo: Mundo): Vencimento[] {
  const { reservas, politica } = mundo;
  const lista: Vencimento[] = [];
  const primeiroInicio = primeiroInicioDasSeries(reservas);

  for (const reserva of reservas) {
    if (reserva.status === 'Pendente') {
      const referenciaInicio =
        reserva.serieId != null && primeiroInicio.has(reserva.serieId)
          ? primeiroInicio.get(reserva.serieId)!
          : reserva.inicio.getTime();

      const em = prazoDeDecisao(new Date(referenciaInicio), politica);
      lista.push({
        em,
        regra: 'RN12',
        tipo: 'Expiracao',
        reserva,
      });
    } else if (reserva.status === 'Confirmada') {
      const em = new Date(reserva.inicio.getTime() - politica.lembreteAntesDoInicioMin * MINUTO);
      lista.push({
        em,
        regra: 'US16',
        tipo: 'Lembrete',
        reserva,
      });
    }
  }

  return lista.sort((a, b) => {
    const diffTempo = a.em.getTime() - b.em.getTime();
    if (diffTempo !== 0) return diffTempo;
    const diffRegra = PRIORIDADE_REGRA[a.regra] - PRIORIDADE_REGRA[b.regra];
    if (diffRegra !== 0) return diffRegra;
    return a.reserva.id - b.reserva.id;
  });
}

/**
 * Aplica, em ordem cronológica, todo vencimento com `em <= agora`.
 * Cada efeito leva a data do VENCIMENTO, não a do processamento (#12, ADR 0004).
 * Ordena os vencimentos uma única vez no início do ciclo.
 */
export function sincronizar(mundo: Mundo, agora: Date): { mundo: Mundo; efeitos: EfeitoCiclo[] } {
  let reservasAtuais = [...mundo.reservas];
  const efeitos: EfeitoCiclo[] = [];
  const seriesNotificadas = new Set<number>();

  const listaVencimentos = vencimentos(mundo);

  for (const vencimento of listaVencimentos) {
    if (vencimento.em.getTime() > agora.getTime()) break;

    const { reserva, em, tipo } = vencimento;

    switch (tipo) {
      case 'Expiracao': {
        reservasAtuais = reservasAtuais.map((r) =>
          r.id === reserva.id ? { ...r, status: 'Expirada' as const } : r,
        );
        efeitos.push({
          evento: 'StatusMudou',
          reservaId: reserva.id,
          transicao: {
            de: 'Pendente',
            para: 'Expirada',
            em,
            porId: null,
          },
        });

        // RN21: a Série é tratada como um item só; emite uma única Notificação para a Série.
        if (reserva.serieId != null) {
          if (!seriesNotificadas.has(reserva.serieId)) {
            seriesNotificadas.add(reserva.serieId);
            efeitos.push({
              evento: 'NotificacaoEmitida',
              notificacao: {
                destinatarioId: reserva.usuarioId,
                tipo: 'Expiracao',
                mensagem: `Seu Pedido em Série de ${reserva.recurso.nome} expirou.`,
                em,
                reservaId: reserva.id,
              },
            });
          }
        } else {
          const intervalo = intervaloEmSaoPaulo(reserva.inicio, reserva.fim);
          efeitos.push({
            evento: 'NotificacaoEmitida',
            notificacao: {
              destinatarioId: reserva.usuarioId,
              tipo: 'Expiracao',
              mensagem: `Seu Pedido de ${reserva.recurso.nome} (${intervalo}) expirou.`,
              em,
              reservaId: reserva.id,
            },
          });
        }
        break;
      }
      case 'Lembrete': {
        // US16, ADR 0004: Lembrete processado depois ou exatamente no início da Reserva é descartado.
        if (agora.getTime() < reserva.inicio.getTime()) {
          const intervalo = intervaloEmSaoPaulo(reserva.inicio, reserva.fim);
          efeitos.push({
            evento: 'NotificacaoEmitida',
            notificacao: {
              destinatarioId: reserva.usuarioId,
              tipo: 'Lembrete',
              mensagem: `Lembrete: sua Reserva de ${reserva.recurso.nome} (${intervalo}) começa às ${horaEmSaoPaulo(reserva.inicio)}.`,
              em,
              reservaId: reserva.id,
            },
          });
        }
        break;
      }
    }
  }

  return {
    mundo: { ...mundo, reservas: reservasAtuais },
    efeitos,
  };
}
