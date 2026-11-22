import {
  violacao,
  type CancelarSerie,
  type Politica,
  type Status,
  type Violacao,
} from '@reservas/shared';
import { emSaoPaulo, horaEmSaoPaulo, intervaloEmSaoPaulo } from '../../../comum/instante';
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

/** Uma Ocorrência da Série, como o Cancelamento a partir de uma data precisa dela. */
export interface OcorrenciaDoCancelamento {
  id: number;
  inicio: Date;
  fim: Date;
  status: Status;
}

export interface FatosDoCancelamentoDaSerie {
  serie: {
    id: number;
    usuarioId: number;
    recurso: { nome: string };
    ocorrencias: OcorrenciaDoCancelamento[];
  };
  politica: Politica;
}

export type EfeitoDoCancelamento = StatusMudou | PenalidadeGerada | NotificacaoEmitida;

export type DecisaoDaSerie =
  | { tipo: 'aceita'; efeitos: EfeitoDoCancelamento[] }
  | { tipo: 'recusada'; violacoes: Violacao[] }
  | { tipo: 'proibida'; violacoes: Violacao[] };

const CAMPO_A_PARTIR_DE = 'aPartirDe';

/** `2026-11-17` → `17/11/2026`. */
function rotuloDaData(data: string) {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * US09, US13, RN16 e RN21: o dono cancela as Ocorrências da Série a partir de `aPartirDe` (no
 * calendário de São Paulo). Cancela todas as Ocorrências Pendentes ou Confirmadas antes do início
 * a partir daquela data, aplicando a regra do Cancelamento tardio (RN16) a cada uma.
 */
export function decidirCancelamentoDaSerie(
  { serie, politica }: FatosDoCancelamentoDaSerie,
  { aPartirDe }: CancelarSerie,
  quem: { id: number },
  agora: Date,
): DecisaoDaSerie {
  // RN16, regra de dono: só quem criou a Série pode cancelá-la (403).
  if (quem.id !== serie.usuarioId) {
    return {
      tipo: 'proibida',
      violacoes: [violacao('RN16', 'Só quem criou a Série pode cancelá-la.')],
    };
  }

  const doCorteEmDiante = [...serie.ocorrencias]
    .filter(({ inicio }) => emSaoPaulo(inicio).data >= aPartirDe)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

  if (doCorteEmDiante.length === 0) {
    return {
      tipo: 'recusada',
      violacoes: [
        violacao(
          'RN16',
          `Não há Ocorrências na Série a partir de ${rotuloDaData(aPartirDe)}.`,
          CAMPO_A_PARTIR_DE,
        ),
      ],
    };
  }

  const elegiveis = doCorteEmDiante.filter(
    ({ status, inicio }) => (status === 'Pendente' || status === 'Confirmada') && agora < inicio,
  );

  if (elegiveis.length === 0) {
    const todasJaCanceladas = doCorteEmDiante.every(({ status }) => status === 'Cancelada');
    return {
      tipo: 'recusada',
      violacoes: [
        violacao(
          'RN16',
          todasJaCanceladas
            ? `As Ocorrências a partir de ${rotuloDaData(aPartirDe)} já foram canceladas.`
            : `Não há Ocorrências que possam ser canceladas a partir de ${rotuloDaData(aPartirDe)}: elas já começaram ou foram encerradas.`,
        ),
      ],
    };
  }

  const efeitos: EfeitoDoCancelamento[] = [];
  for (const ocorrencia of elegiveis) {
    const reserva: ReservaDoCancelamento = {
      ...ocorrencia,
      usuarioId: serie.usuarioId,
      recurso: serie.recurso,
    };
    efeitos.push({
      evento: 'StatusMudou',
      reservaId: ocorrencia.id,
      transicao: { de: ocorrencia.status, para: 'Cancelada', em: agora, porId: quem.id },
    });
    if (ehTardio(reserva, politica, agora)) {
      efeitos.push(...penalidadeDoTardio(reserva, politica, agora));
    }
  }

  return { tipo: 'aceita', efeitos };
}
