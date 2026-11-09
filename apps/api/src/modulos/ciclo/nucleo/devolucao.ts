import {
  violacao,
  type RegistrarDevolucao,
  type Status,
  type TipoRecurso,
  type Violacao,
} from '@reservas/shared';
import type { StatusMudou } from '../../reservas';

const MINUTO = 60_000;

/** O que a regra precisa saber da Reserva e do Recurso dela na Devolução. */
export interface ReservaDaDevolucao {
  id: number;
  status: Status;
  recurso: {
    tipo: TipoRecurso;
    gestorId: number;
  };
}

export interface FatosDaDevolucao {
  reserva: ReservaDaDevolucao;
}

export type Decisao =
  | { tipo: 'aceita'; efeitos: [StatusMudou] }
  | { tipo: 'recusada'; violacoes: Violacao[] }
  | { tipo: 'proibida'; violacoes: Violacao[] };

/**
 * RN17: se o fim da Tolerância de Devolução chega sem Devolução, a Reserva de Equipamento Em uso
 * fica em Devolução atrasada (`agora >= fim + toleranciaDeDevolucaoMin`).
 */
export function devolucaoAtrasada(
  fim: Date,
  { toleranciaDeDevolucaoMin }: { toleranciaDeDevolucaoMin: number },
  agora: Date,
): boolean {
  return agora.getTime() >= fim.getTime() + toleranciaDeDevolucaoMin * MINUTO;
}

/** RN17: Espaço conclui sozinho no fim do Intervalo (RN18); só Equipamento tem Devolução. */
function naoEquipamento(tipo: TipoRecurso): Violacao[] {
  if (tipo === 'Equipamento') return [];
  return [violacao('RN17', 'Só Reserva de Equipamento tem Devolução.')];
}

/** RN17: só uma Reserva Em uso aceita Devolução. */
function naoEmUso(status: Status): Violacao[] {
  switch (status) {
    case 'EmUso':
      return [];
    case 'Concluida':
      return [violacao('RN17', 'A Devolução desta Reserva já foi registrada.')];
    case 'Pendente':
    case 'Confirmada':
      return [violacao('RN17', 'Esta Reserva ainda não está em uso.')];
    default:
      return [violacao('RN17', 'Esta Reserva já foi encerrada e não aceita Devolução.')];
  }
}

/** RN17: quando o Equipamento foi perdido ou roubado, a observação explicando é obrigatória. */
function semObservacaoDePerda({ extraviado, observacao }: RegistrarDevolucao): Violacao[] {
  if (!extraviado || observacao?.trim()) return [];
  return [
    violacao(
      'RN17',
      'Informe uma observação explicando a perda ou o roubo do Equipamento.',
      'observacao',
    ),
  ];
}

/** US14: o Gestor responsável registra a Devolução do Equipamento, encerrando a Reserva. */
export function decidirDevolucao(
  { reserva }: FatosDaDevolucao,
  comando: RegistrarDevolucao,
  quem: { id: number },
  agora: Date,
): Decisao {
  // RN13, regra de responsável: outro Gestor não decide sobre o Recurso (403).
  if (quem.id !== reserva.recurso.gestorId) {
    return {
      tipo: 'proibida',
      violacoes: [
        violacao(
          'RN13',
          'Só o Gestor responsável por este Recurso pode registrar a Devolução dele.',
        ),
      ],
    };
  }

  const violacoes = [
    ...naoEquipamento(reserva.recurso.tipo),
    ...naoEmUso(reserva.status),
    ...semObservacaoDePerda(comando),
  ];
  if (violacoes.length > 0) return { tipo: 'recusada', violacoes };

  const observacao = comando.observacao?.trim() || undefined;
  return {
    tipo: 'aceita',
    efeitos: [
      {
        evento: 'StatusMudou',
        reservaId: reserva.id,
        transicao: {
          de: 'EmUso',
          para: 'Concluida',
          em: agora,
          porId: quem.id,
          ...(observacao && { observacao }),
        },
      },
    ],
  };
}
