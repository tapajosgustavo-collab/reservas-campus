import { violacao, type RecusarPedido, type Status, type Violacao } from '@reservas/shared';
import { dataEmSaoPaulo, horaEmSaoPaulo, intervaloEmSaoPaulo } from '../../../comum/instante';
import type { StatusMudou, StatusMudouEmLote } from '../../reservas';
import type { NotificacaoEmitida } from './notificacao';

export type { NotificacaoEmitida } from './notificacao';

const MINUTO = 60_000;

/** O Recurso do Pedido: o nome vai na Notificação e o Gestor responsável decide (RN13). */
interface RecursoDoPedido {
  nome: string;
  gestorId: number;
}

type Politica = { prazoDeDecisaoMin: number };

/** O que a regra precisa saber do Pedido e do Recurso dele para decidir. */
export interface ReservaDoPedido {
  id: number;
  usuarioId: number;
  /** A Série da Ocorrência, ou `null` na Reserva avulsa (RN21). */
  serieId: number | null;
  status: Status;
  inicio: Date;
  fim: Date;
  recurso: RecursoDoPedido;
}

export interface FatosDoPedido {
  reserva: ReservaDoPedido;
  politica: Politica;
}

export type Decisao =
  | { tipo: 'aceita'; efeitos: [StatusMudou, NotificacaoEmitida] }
  | { tipo: 'recusada'; violacoes: Violacao[] }
  | { tipo: 'proibida'; violacoes: Violacao[] };

/** RN13: só o Gestor que cadastrou o Recurso decide os Pedidos dele (403). */
function outroGestor(recurso: RecursoDoPedido, quem: { id: number }): Violacao[] {
  if (quem.id === recurso.gestorId) return [];
  return [
    violacao('RN13', 'Só o Gestor responsável por este Recurso pode decidir os Pedidos dele.'),
  ];
}

/** RN12: o Prazo de decisão, `prazoDeDecisaoMin` antes do início; nesse instante o Pedido expira. */
export function prazoDeDecisao(inicio: Date, { prazoDeDecisaoMin }: Politica) {
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
  // RN21: a Ocorrência Pendente é decidida com a Série inteira; depois, segue a vida dela.
  if (reserva.serieId !== null) {
    return [
      violacao(
        'RN21',
        'Esta Ocorrência é de uma Série: aprove ou recuse a Série inteira, na fila.',
      ),
    ];
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
  const proibicoes = outroGestor(reserva.recurso, quem);
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

/** A justificativa na Notificação sempre termina com ponto final. */
const comPonto = (motivo: string) => (motivo.endsWith('.') ? motivo : `${motivo}.`);

/** US11: a Recusa do Gestor responsável encerra o Pedido, com a justificativa no histórico. */
export function decidirRecusa(
  fatos: FatosDoPedido,
  { justificativa }: RecusarPedido,
  quem: { id: number },
  agora: Date,
): Decisao {
  const { reserva } = fatos;
  const proibicoes = outroGestor(reserva.recurso, quem);
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
          mensagem: `Seu Pedido de ${reserva.recurso.nome} (${intervalo}) foi recusado: ${comPonto(motivo)}`,
          em: agora,
          reservaId: reserva.id,
        },
      },
    ],
  };
}

/** Uma Ocorrência da Série, como a decisão da Série precisa dela. */
export interface OcorrenciaDaSerie {
  id: number;
  status: Status;
  inicio: Date;
  fim: Date;
}

/** RN21: a Série, com todas as Ocorrências (de qualquer Status) e o Recurso dela. */
export interface FatosDaSerie {
  serie: {
    id: number;
    usuarioId: number;
    recurso: RecursoDoPedido;
    ocorrencias: OcorrenciaDaSerie[];
  };
  politica: Politica;
}

export type DecisaoDaSerie =
  | { tipo: 'aceita'; efeitos: [StatusMudouEmLote, NotificacaoEmitida] }
  | { tipo: 'recusada'; violacoes: Violacao[] }
  | { tipo: 'proibida'; violacoes: Violacao[] };

/** As Ocorrências Pendentes da Série, da primeira à última (uma por semana, nunca no mesmo início). */
function pendentes(ocorrencias: readonly OcorrenciaDaSerie[]) {
  return ocorrencias
    .filter(({ status }) => status === 'Pendente')
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/**
 * RN21 e RN12: a Série é decidida enquanto tiver Ocorrência Pendente, até o Prazo de decisão da
 * primeira. Nesse instante o `sincronizar` expira todas juntas.
 */
function serieNaoDecidivel(
  { serie, politica }: FatosDaSerie,
  aDecidir: readonly OcorrenciaDaSerie[],
  agora: Date,
): Violacao[] {
  const [primeira] = aDecidir;
  if (!primeira) {
    if (serie.ocorrencias.some(({ status }) => status === 'Expirada')) {
      return [violacao('RN12', 'Esta Série já expirou.')];
    }
    return [violacao('RN10', 'Esta Série não aguarda decisão.')];
  }
  const prazo = prazoDeDecisao(primeira.inicio, politica);
  if (agora < prazo) return [];
  return [
    violacao(
      'RN12',
      `O Prazo de decisão desta Série terminou às ${horaEmSaoPaulo(prazo)}: ela expirou.`,
    ),
  ];
}

/** "3 Ocorrências, de 11/11/2026 a 25/11/2026, das 14:00 às 16:00", como a Notificação mostra. */
function rotuloDasOcorrencias(aDecidir: readonly OcorrenciaDaSerie[]): string {
  const primeira = aDecidir[0]!;
  const ultima = aDecidir[aDecidir.length - 1]!;
  const horario = `das ${horaEmSaoPaulo(primeira.inicio)} às ${horaEmSaoPaulo(primeira.fim)}`;
  if (aDecidir.length === 1) {
    return `1 Ocorrência, ${dataEmSaoPaulo(primeira.inicio)}, ${horario}`;
  }
  const datas = `de ${dataEmSaoPaulo(primeira.inicio)} a ${dataEmSaoPaulo(ultima.inicio)}`;
  return `${aDecidir.length} Ocorrências, ${datas}, ${horario}`;
}

/**
 * RN21: a decisão da Série vale para todas as Ocorrências Pendentes de uma vez, com uma linha no
 * histórico de cada uma e uma Notificação só ao Docente.
 */
function decidirSerie(
  fatos: FatosDaSerie,
  quem: { id: number },
  agora: Date,
  decisao: { para: 'Confirmada' } | { para: 'Recusada'; justificativa: string },
): DecisaoDaSerie {
  const { serie } = fatos;
  const proibicoes = outroGestor(serie.recurso, quem);
  if (proibicoes.length > 0) return { tipo: 'proibida', violacoes: proibicoes };

  const aDecidir = pendentes(serie.ocorrencias);
  const violacoes = [
    ...serieNaoDecidivel(fatos, aDecidir, agora),
    ...(decisao.para === 'Recusada' ? semJustificativa(decisao.justificativa) : []),
  ];
  if (violacoes.length > 0) return { tipo: 'recusada', violacoes };

  const motivo = decisao.para === 'Recusada' ? decisao.justificativa.trim() : null;
  const doPedido = `Seu Pedido em Série de ${serie.recurso.nome} (${rotuloDasOcorrencias(aDecidir)})`;
  return {
    tipo: 'aceita',
    efeitos: [
      {
        evento: 'StatusMudouEmLote',
        reservaIds: aDecidir.map(({ id }) => id),
        transicao: {
          de: 'Pendente',
          para: decisao.para,
          em: agora,
          porId: quem.id,
          ...(motivo === null ? {} : { observacao: motivo }),
        },
      },
      {
        evento: 'NotificacaoEmitida',
        notificacao: {
          destinatarioId: serie.usuarioId,
          tipo: motivo === null ? 'Aprovacao' : 'Recusa',
          mensagem:
            motivo === null
              ? `${doPedido} foi aprovado.`
              : `${doPedido} foi recusado: ${comPonto(motivo)}`,
          em: agora,
          reservaId: aDecidir[0]!.id,
        },
      },
    ],
  };
}

/** US11 e RN21: a Aprovação da Série confirma todas as Ocorrências Pendentes dela. */
export function decidirAprovacaoDaSerie(
  fatos: FatosDaSerie,
  quem: { id: number },
  agora: Date,
): DecisaoDaSerie {
  return decidirSerie(fatos, quem, agora, { para: 'Confirmada' });
}

/** US11, RN11 e RN21: a Recusa da Série recusa todas as Ocorrências Pendentes, com a mesma justificativa. */
export function decidirRecusaDaSerie(
  fatos: FatosDaSerie,
  { justificativa }: RecusarPedido,
  quem: { id: number },
  agora: Date,
): DecisaoDaSerie {
  return decidirSerie(fatos, quem, agora, { para: 'Recusada', justificativa });
}

/** O mínimo de um Pedido Pendente para entrar na fila. */
export interface PedidoNaFila {
  id: number;
  serieId: number | null;
  inicio: Date;
  fim: Date;
}

/**
 * Um item da fila: o Pedido avulso, ou a Série com os dados da primeira Ocorrência Pendente. As
 * `reservas` são as Ocorrências Pendentes, da primeira à última (no avulso, só ele).
 */
export type ItemDaFila<P extends PedidoNaFila> = P & {
  expiraEm: Date;
  reservas: { id: number; inicio: Date; fim: Date }[];
};

/**
 * US11 e RN21: a fila do Gestor, com a Série como um item só, pelo início (da primeira Ocorrência).
 * O "Expira em" da Série é o Prazo de decisão da primeira Ocorrência Pendente (RN12).
 */
export function filaDoGestor<P extends PedidoNaFila>(
  pedidos: readonly P[],
  politica: Politica,
): ItemDaFila<P>[] {
  const porInicio = [...pedidos].sort(
    (a, b) => a.inicio.getTime() - b.inicio.getTime() || a.id - b.id,
  );
  const itens: ItemDaFila<P>[] = [];
  const itemDaSerie = new Map<number, ItemDaFila<P>>();
  for (const pedido of porInicio) {
    const ocorrencia = { id: pedido.id, inicio: pedido.inicio, fim: pedido.fim };
    const daSerie = pedido.serieId === null ? undefined : itemDaSerie.get(pedido.serieId);
    if (daSerie) {
      daSerie.reservas.push(ocorrencia);
      continue;
    }
    const item = {
      ...pedido,
      expiraEm: prazoDeDecisao(pedido.inicio, politica),
      reservas: [ocorrencia],
    };
    itens.push(item);
    if (pedido.serieId !== null) itemDaSerie.set(pedido.serieId, item);
  }
  return itens;
}
