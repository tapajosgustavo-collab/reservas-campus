import { violacao, type Status, type Violacao } from '@reservas/shared';
import { horaEmSaoPaulo } from '../../../comum/instante';
import type { StatusMudou } from '../../reservas';

/** O que a regra precisa saber da Reserva do Cancelamento. */
export interface ReservaDoCancelamento {
  id: number;
  usuarioId: number;
  inicio: Date;
  status: Status;
}

export interface FatosDoCancelamento {
  reserva: ReservaDoCancelamento;
}

export type Decisao =
  | { tipo: 'aceita'; efeitos: [StatusMudou] }
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

/** US13: o dono cancela a própria Reserva Pendente ou Confirmada antes do início. */
export function decidirCancelamento(
  { reserva }: FatosDoCancelamento,
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

  return {
    tipo: 'aceita',
    efeitos: [
      {
        evento: 'StatusMudou',
        reservaId: reserva.id,
        transicao: { de: reserva.status, para: 'Cancelada', em: agora, porId: quem.id },
      },
    ],
  };
}
