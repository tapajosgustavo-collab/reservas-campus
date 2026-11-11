import {
  violacao,
  type RecusarPedido,
  type Status,
  type TipoNotificacao,
  type Violacao,
} from '@reservas/shared';
import { horaEmSaoPaulo, intervaloEmSaoPaulo } from '../../../comum/instante';
import type { StatusMudou } from '../../reservas';

const MINUTO = 60_000;

/** US16: uma Notificação pronta para gravar, com a `mensagem` montada pelo núcleo. */
export interface NotificacaoEmitida {
  evento: 'NotificacaoEmitida';
  notificacao: {
    destinatarioId: number;
    tipo: TipoNotificacao;
    mensagem: string;
    em: Date;
    reservaId?: number;
    suspensaoId?: number;
  };
}

/** O que a regra precisa saber do Pedido e do Recurso dele para decidir. */
export interface ReservaDoPedido {
  id: number;
  usuarioId: number;
  status: Status;
  inicio: Date;
  fim: Date;
  recurso: { nome: string; gestorId: number };
}

export interface FatosDoPedido {
  reserva: ReservaDoPedido;
  politica: { prazoDeDecisaoMin: number };
}

export type Decisao =
  | { tipo: 'aceita'; efeitos: [StatusMudou, NotificacaoEmitida] }
  | { tipo: 'recusada'; violacoes: Violacao[] }
  | { tipo: 'proibida'; violacoes: Violacao[] };

/** RN13: só o Gestor que cadastrou o Recurso decide os Pedidos dele (403). */
function outroGestor(reserva: ReservaDoPedido, quem: { id: number }): Violacao[] {
  if (quem.id === reserva.recurso.gestorId) return [];
  return [
    violacao('RN13', 'Só o Gestor responsável por este Recurso pode decidir os Pedidos dele.'),
  ];
}

/** RN12: o Prazo de decisão, `prazoDeDecisaoMin` antes do início; nesse instante o Pedido expira. */
export function prazoDeDecisao(inicio: Date, { prazoDeDecisaoMin }: FatosDoPedido['politica']) {
  return new Date(inicio.getTime() - prazoDeDecisaoMin * MINUTO);
}

/**
 * RN12: só o Pedido Pendente, antes do Prazo de decisão, é decidido. O `sincronizar` grava a
 * Expiração; o prazo conferido aqui também barra a decisão que chega no mesmo instante.
 */
function naoDecidivel({ reserva, politica }: FatosDoPedido, agora: Date): Violacao[] {
  switch (reserva.status) {
    case 'Pendente':
      break;
    case 'Expirada':
      return [violacao('RN12', 'Este Pedido já expirou.')];
    // RN10: só a Reserva Pendente é um Pedido à espera de decisão.
    case 'Confirmada':
      return [violacao('RN10', 'Esta Reserva já está Confirmada.')];
    case 'Recusada':
      return [violacao('RN10', 'Este Pedido já foi recusado.')];
    case 'Cancelada':
      return [violacao('RN10', 'Este Pedido já foi cancelado.')];
    default:
      return [violacao('RN10', 'Esta Reserva não aguarda decisão.')];
  }
  const prazo = prazoDeDecisao(reserva.inicio, politica);
  if (agora < prazo) return [];
  return [
    violacao(
      'RN12',
      `O Prazo de decisão deste Pedido terminou às ${horaEmSaoPaulo(prazo)}: ele expirou.`,
    ),
  ];
}

/** US11: a Aprovação do Gestor responsável torna Confirmado o Pedido Pendente. */
export function decidirAprovacao(fatos: FatosDoPedido, quem: { id: number }, agora: Date): Decisao {
  const { reserva } = fatos;
  const proibicoes = outroGestor(reserva, quem);
  if (proibicoes.length > 0) return { tipo: 'proibida', violacoes: proibicoes };

  const violacoes = naoDecidivel(fatos, agora);
  if (violacoes.length > 0) return { tipo: 'recusada', violacoes };

  const intervalo = intervaloEmSaoPaulo(reserva.inicio, reserva.fim);
  return {
    tipo: 'aceita',
    efeitos: [
      {
        evento: 'StatusMudou',
        reservaId: reserva.id,
        transicao: { de: 'Pendente', para: 'Confirmada', em: agora, porId: quem.id },
      },
      {
        evento: 'NotificacaoEmitida',
        notificacao: {
          destinatarioId: reserva.usuarioId,
          tipo: 'Aprovacao',
          mensagem: `Seu Pedido de ${reserva.recurso.nome} (${intervalo}) foi aprovado.`,
          em: agora,
          reservaId: reserva.id,
        },
      },
    ],
  };
}

/** RN11: o Gestor só recusa um Pedido escrevendo a justificativa, que vai na Notificação. */
function semJustificativa(justificativa: string): Violacao[] {
  if (justificativa.trim()) return [];
  return [
    violacao(
      'RN11',
      'Escreva a justificativa da Recusa: ela vai na Notificação ao Usuário.',
      'justificativa',
    ),
  ];
}

/** US11: a Recusa do Gestor responsável encerra o Pedido, com a justificativa no histórico. */
export function decidirRecusa(
  fatos: FatosDoPedido,
  { justificativa }: RecusarPedido,
  quem: { id: number },
  agora: Date,
): Decisao {
  const { reserva } = fatos;
  const proibicoes = outroGestor(reserva, quem);
  if (proibicoes.length > 0) return { tipo: 'proibida', violacoes: proibicoes };

  const violacoes = [...naoDecidivel(fatos, agora), ...semJustificativa(justificativa)];
  if (violacoes.length > 0) return { tipo: 'recusada', violacoes };

  const motivo = justificativa.trim();
  const intervalo = intervaloEmSaoPaulo(reserva.inicio, reserva.fim);
  return {
    tipo: 'aceita',
    efeitos: [
      {
        evento: 'StatusMudou',
        reservaId: reserva.id,
        transicao: {
          de: 'Pendente',
          para: 'Recusada',
          em: agora,
          porId: quem.id,
          observacao: motivo,
        },
      },
      {
        evento: 'NotificacaoEmitida',
        notificacao: {
          destinatarioId: reserva.usuarioId,
          tipo: 'Recusa',
          mensagem: `Seu Pedido de ${reserva.recurso.nome} (${intervalo}) foi recusado: ${motivo}`,
          em: agora,
          reservaId: reserva.id,
        },
      },
    ],
  };
}
