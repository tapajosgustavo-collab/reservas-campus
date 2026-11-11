import { POLITICA, type Status } from '@reservas/shared';
import { intervaloEmSaoPaulo } from '../../../comum/instante';
import type { StatusMudou } from '../../reservas';
import type { NotificacaoEmitida } from './notificacao';

const MINUTO = 60_000;

export interface ReservaDoCiclo {
  id: number;
  usuarioId: number;
  status: Status;
  inicio: Date;
  fim: Date;
  recurso: { nome: string };
  serieId?: number | null;
  jaLembrou?: boolean;
}

export interface PoliticaDoCiclo {
  prazoDeDecisaoMin: number;
  lembreteAntesDoInicioMin: number;
}

export interface Mundo {
  reservas: ReservaDoCiclo[];
  politica?: Partial<PoliticaDoCiclo>;
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

const obterPolitica = (politica?: Partial<PoliticaDoCiclo>): PoliticaDoCiclo => ({
  prazoDeDecisaoMin: politica?.prazoDeDecisaoMin ?? POLITICA.prazoDeDecisaoMin,
  lembreteAntesDoInicioMin: politica?.lembreteAntesDoInicioMin ?? POLITICA.lembreteAntesDoInicioMin,
});

/**
 * ADR 0004: lista todos os vencimentos ainda não aplicados no mundo, em ordem cronológica
 * com desempate por prioridade de regra e id da Reserva.
 */
export function vencimentos(
  mundo: Mundo,
  primeiroInicioPorSerie?: ReadonlyMap<number, number>,
): Vencimento[] {
  const { reservas, politica: politicaParcial } = mundo;
  const politica = obterPolitica(politicaParcial);
  const lista: Vencimento[] = [];

  // Mapeia o início da primeira ocorrência para séries com pedidos pendentes (RN21/RN12).
  const primeiroInicio =
    primeiroInicioPorSerie ??
    (() => {
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
    })();

  for (const reserva of reservas) {
    if (reserva.status === 'Pendente') {
      const referenciaInicio =
        reserva.serieId != null && primeiroInicio.has(reserva.serieId)
          ? primeiroInicio.get(reserva.serieId)!
          : reserva.inicio.getTime();

      const em = new Date(referenciaInicio - politica.prazoDeDecisaoMin * MINUTO);
      lista.push({
        em,
        regra: 'RN12',
        tipo: 'Expiracao',
        reserva,
      });
    } else if (reserva.status === 'Confirmada') {
      if (!reserva.jaLembrou) {
        const em = new Date(reserva.inicio.getTime() - politica.lembreteAntesDoInicioMin * MINUTO);
        lista.push({
          em,
          regra: 'US16',
          tipo: 'Lembrete',
          reserva,
        });
      }
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
 * Idempotente: rodar com o mesmo `agora` ou momento posterior não reaplica efeitos passados.
 */
export function sincronizar(mundo: Mundo, agora: Date): { mundo: Mundo; efeitos: EfeitoCiclo[] } {
  let reservasAtuais = [...mundo.reservas];
  const efeitos: EfeitoCiclo[] = [];
  const politica = mundo.politica;

  // Fixa o início da 1ª ocorrência de cada série pendente no início da sincronização (RN21/RN12).
  const primeiroInicioPorSerie = new Map<number, number>();
  for (const r of reservasAtuais) {
    if (r.status === 'Pendente' && r.serieId != null) {
      const atual = primeiroInicioPorSerie.get(r.serieId);
      const inicioTempo = r.inicio.getTime();
      if (atual === undefined || inicioTempo < atual) {
        primeiroInicioPorSerie.set(r.serieId, inicioTempo);
      }
    }
  }

  for (;;) {
    const proximos = vencimentos({ reservas: reservasAtuais, politica }, primeiroInicioPorSerie);
    const vencimento = proximos[0];
    if (!vencimento || vencimento.em.getTime() > agora.getTime()) break;

    const { reserva, em, tipo } = vencimento;

    switch (tipo) {
      case 'Expiracao': {
        reservasAtuais = reservasAtuais.map((r) =>
          r.id === reserva.id ? { ...r, status: 'Expirada' as const } : r,
        );
        const intervalo = intervaloEmSaoPaulo(reserva.inicio, reserva.fim);
        efeitos.push(
          {
            evento: 'StatusMudou',
            reservaId: reserva.id,
            transicao: {
              de: 'Pendente',
              para: 'Expirada',
              em,
              porId: null,
            },
          },
          {
            evento: 'NotificacaoEmitida',
            notificacao: {
              destinatarioId: reserva.usuarioId,
              tipo: 'Expiracao',
              mensagem: `Seu Pedido de ${reserva.recurso.nome} (${intervalo}) expirou.`,
              em,
              reservaId: reserva.id,
            },
          },
        );
        break;
      }
      case 'Lembrete': {
        reservasAtuais = reservasAtuais.map((r) =>
          r.id === reserva.id ? { ...r, jaLembrou: true } : r,
        );
        // US16, ADR 0004: Lembrete processado depois ou exatamente no início da Reserva é descartado.
        if (agora.getTime() < reserva.inicio.getTime()) {
          const intervalo = intervaloEmSaoPaulo(reserva.inicio, reserva.fim);
          efeitos.push({
            evento: 'NotificacaoEmitida',
            notificacao: {
              destinatarioId: reserva.usuarioId,
              tipo: 'Lembrete',
              mensagem: `Lembrete: sua Reserva de ${reserva.recurso.nome} (${intervalo}) começa em 1 hora.`,
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
