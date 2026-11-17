import { violacao, type Politica, type Status, type Violacao } from '@reservas/shared';
import { horaEmSaoPaulo, intervaloEmSaoPaulo } from '../../../comum/instante';
import type { PenalidadeGerada } from '../../conduta';
import type { StatusMudou } from '../../reservas';
import type { NotificacaoEmitida } from './notificacao';

const MINUTO = 60_000;

/** O que a regra precisa saber da Reserva do Cancelamento. */
export interface ReservaDoCancelamento {
  id: number;
  usuarioId: number;
  inicio: Date;
  fim: Date;
  status: Status;
  recurso: { nome: string };
}

export interface FatosDoCancelamento {
  reserva: ReservaDoCancelamento;
  politica: Politica;
}

export type Decisao =
  | { tipo: 'aceita'; efeitos: [StatusMudou] | [StatusMudou, PenalidadeGerada, NotificacaoEmitida] }
  | { tipo: 'recusada'; violacoes: Violacao[] }
  | { tipo: 'proibida'; violacoes: Violacao[] };

/** RN16: o Cancelamento só é aceito antes do início do Intervalo (`agora < inicio`). */
function depoisDoInicio(inicio: Date, agora: Date): Violacao[] {
  if (agora < inicio) return [];
  return [
    violacao(
      'RN16',
      `A Reserva só pode ser cancelada antes do início (${horaEmSaoPaulo(inicio)}).`,
    ),
  ];
}

/** RN16: só a Reserva Pendente ou Confirmada pode ser cancelada. */
function naoCancelavel(status: Status): Violacao[] {
  switch (status) {
    case 'Pendente':
    case 'Confirmada':
      return [];
    case 'EmUso':
      return [violacao('RN16', 'Esta Reserva já está em uso e não pode mais ser cancelada.')];
    case 'Cancelada':
      return [violacao('RN16', 'Esta Reserva já foi cancelada.')];
    default:
      return [violacao('RN16', 'Esta Reserva já foi encerrada e não pode mais ser cancelada.')];
  }
}

/**
 * RN16: cancelar a Confirmada com menos de `cancelamentoSemPenalidadeMin` até o início é
 * Cancelamento tardio. Cancelar uma Pendente nunca é.
 */
function ehTardio({ status, inicio }: ReservaDoCancelamento, politica: Politica, agora: Date) {
  const antecedencia = inicio.getTime() - agora.getTime();
  return status === 'Confirmada' && antecedencia < politica.cancelamentoSemPenalidadeMin * MINUTO;
}

/** RN16: a Penalidade do Cancelamento tardio, gravada pelo M1, e a Notificação dela. */
function penalidadeDoTardio(
  reserva: ReservaDoCancelamento,
  { cancelamentoSemPenalidadeMin }: Politica,
  agora: Date,
): [PenalidadeGerada, NotificacaoEmitida] {
  const intervalo = intervaloEmSaoPaulo(reserva.inicio, reserva.fim);
  return [
    {
      evento: 'PenalidadeGerada',
      penalidade: {
        usuarioId: reserva.usuarioId,
        reservaId: reserva.id,
        motivo: 'CancelamentoTardio',
        em: agora,
      },
    },
    {
      evento: 'NotificacaoEmitida',
      notificacao: {
        destinatarioId: reserva.usuarioId,
        tipo: 'Penalidade',
        mensagem:
          `Você recebeu uma Penalidade por Cancelamento tardio na Reserva de ` +
          `${reserva.recurso.nome} (${intervalo}): faltavam menos de ` +
          `${cancelamentoSemPenalidadeMin / 60}h para o início.`,
        em: agora,
        reservaId: reserva.id,
      },
    },
  ];
}

/**
 * US13: o dono cancela a própria Reserva Pendente ou Confirmada antes do início. A Confirmada
 * cancelada perto do início gera Penalidade (RN16).
 */
export function decidirCancelamento(
  { reserva, politica }: FatosDoCancelamento,
  quem: { id: number },
  agora: Date,
): Decisao {
  // RN16, regra de dono: quem não fez a Reserva não fica sabendo de mais nada dela (403).
  if (quem.id !== reserva.usuarioId) {
    return {
      tipo: 'proibida',
      violacoes: [violacao('RN16', 'Só quem fez a Reserva pode cancelá-la.')],
    };
  }

  const porStatus = naoCancelavel(reserva.status);
  const violacoes = porStatus.length > 0 ? porStatus : depoisDoInicio(reserva.inicio, agora);
  if (violacoes.length > 0) return { tipo: 'recusada', violacoes };

  const cancelada: StatusMudou = {
    evento: 'StatusMudou',
    reservaId: reserva.id,
    transicao: { de: reserva.status, para: 'Cancelada', em: agora, porId: quem.id },
  };
  if (!ehTardio(reserva, politica, agora)) return { tipo: 'aceita', efeitos: [cancelada] };
  return {
    tipo: 'aceita',
    efeitos: [cancelada, ...penalidadeDoTardio(reserva, politica, agora)],
  };
}
