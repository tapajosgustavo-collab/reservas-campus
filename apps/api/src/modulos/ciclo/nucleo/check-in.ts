import { violacao, type Status, type Violacao } from '@reservas/shared';
import { horaEmSaoPaulo } from '../../../comum/instante';
import type { StatusMudou } from '../../reservas';

const MINUTO = 60_000;

/** O que a regra precisa saber da Reserva do Check-in. */
export interface ReservaDoCheckIn {
  id: number;
  usuarioId: number;
  inicio: Date;
  status: Status;
}

/** A janela do Check-in na Política (RN14), em minutos em volta do início. */
export interface JanelaDaPolitica {
  checkInAntesDoInicioMin: number;
  toleranciaMin: number;
}

export interface FatosDoCheckIn {
  reserva: ReservaDoCheckIn;
  politica: JanelaDaPolitica;
}

export type Decisao =
  | { tipo: 'aceita'; efeitos: [StatusMudou] }
  | { tipo: 'recusada'; violacoes: Violacao[] }
  | { tipo: 'proibida'; violacoes: Violacao[] };

const somarMinutos = (instante: Date, minutos: number) =>
  new Date(instante.getTime() + minutos * MINUTO);

/**
 * RN14: da abertura (antes do início) até o fim da Tolerância, os dois pela Política. O fim fica de
 * fora: nesse instante a Reserva Confirmada vira Não comparecimento (RN15).
 */
function foraDaJanela(inicio: Date, politica: JanelaDaPolitica, agora: Date): Violacao[] {
  const { checkInAntesDoInicioMin: antes, toleranciaMin: tolerancia } = politica;
  const abre = somarMinutos(inicio, -antes);
  const fecha = somarMinutos(inicio, tolerancia);
  if (agora < abre) {
    const quando = `às ${horaEmSaoPaulo(abre)}, ${antes} minutos antes do início`;
    return [violacao('RN14', `O Check-in abre ${quando}.`)];
  }
  if (agora >= fecha) {
    const quando = `às ${horaEmSaoPaulo(fecha)}, no fim da Tolerância de ${tolerancia} minutos`;
    return [violacao('RN14', `O Check-in fechou ${quando}.`)];
  }
  return [];
}

/** RN14: só a Reserva Confirmada aceita Check-in. A mensagem diz o porquê de cada Status. */
function naoConfirmada(status: Status): Violacao[] {
  switch (status) {
    case 'Confirmada':
      return [];
    case 'Pendente':
      return [
        violacao(
          'RN14',
          'Reserva Pendente não aceita Check-in: ela ainda aguarda a decisão do Gestor.',
        ),
      ];
    case 'EmUso':
      return [violacao('RN14', 'O Check-in desta Reserva já foi feito.')];
    default:
      return [violacao('RN14', 'Esta Reserva já foi encerrada e não aceita mais Check-in.')];
  }
}

/** Só a Confirmada e a Pendente (que ainda pode ser aprovada) têm janela a explicar. */
const temJanela = (status: Status) => status === 'Confirmada' || status === 'Pendente';

/** US12: o dono registra que chegou ao Espaço ou retirou o Equipamento. */
export function decidirCheckIn(
  { reserva, politica }: FatosDoCheckIn,
  quem: { id: number },
  agora: Date,
): Decisao {
  // RN14, regra de dono: quem não fez a Reserva não fica sabendo de mais nada dela (403).
  if (quem.id !== reserva.usuarioId) {
    return {
      tipo: 'proibida',
      violacoes: [violacao('RN14', 'Só quem fez a Reserva pode fazer o Check-in dela.')],
    };
  }

  const violacoes = [
    ...naoConfirmada(reserva.status),
    ...(temJanela(reserva.status) ? foraDaJanela(reserva.inicio, politica, agora) : []),
  ];
  if (violacoes.length > 0) return { tipo: 'recusada', violacoes };

  return {
    tipo: 'aceita',
    efeitos: [
      {
        evento: 'StatusMudou',
        reservaId: reserva.id,
        transicao: { de: 'Confirmada', para: 'EmUso', em: agora, porId: quem.id },
      },
    ],
  };
}
