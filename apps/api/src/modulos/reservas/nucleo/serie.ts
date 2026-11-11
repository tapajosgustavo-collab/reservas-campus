import { datasDaSerie, violacao, type Violacao } from '@reservas/shared';
import { emSaoPaulo, instanteEmSaoPaulo } from '../../../comum/instante';
import {
  dentroDaAntecedenciaMinima,
  dentroDaCapacidade,
  dentroDaCota,
  dentroDaDuracao,
  dentroDoHorario,
  intervaloValido,
  semConflito,
  semIndisponibilidade,
  type FatosDaReserva,
  type Intervalo,
  type PedidoDeReserva,
  type Quem,
  type ReservaCriada,
} from './reservar';

const MINUTO = 60_000;
const CAMPO_ATE = 'ate';
const CAMPO_DATAS_EXCLUIDAS = 'datasExcluidas';

/** O Intervalo da primeira Ocorrência, repetido toda semana até `ate` (`YYYY-MM-DD`). */
export interface PedidoDeSerie extends PedidoDeReserva {
  ate: string;
  /** Datas da Série que não viram Ocorrência e nem são validadas (RN21). */
  datasExcluidas: string[];
}

/** A Série e as Ocorrências dela, cada uma uma Reserva comum. O id da Série vem do banco. */
export interface SerieCriada {
  evento: 'SerieCriada';
  serie: { usuarioId: number; recursoId: number; criadaEm: Date };
  ocorrencias: Omit<ReservaCriada, 'evento'>[];
}

export type DecisaoDaSerie =
  | { tipo: 'aceita'; efeitos: [SerieCriada] }
  | { tipo: 'recusada'; violacoes: Violacao[] }
  | { tipo: 'proibida'; violacoes: Violacao[] };

interface Ocorrencia extends Intervalo {
  data: string;
}

/** `2026-11-17` → `17/11/2026`. */
function rotuloDaData(data: string) {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * RN21: a data final e as desmarcadas. `datas` vem com uma a mais que o limite, para saber se a
 * Série passou dele.
 */
function datasValidas(datas: string[], { ate, datasExcluidas }: PedidoDeSerie, limite: number) {
  if (datas.length === 0) {
    return [
      violacao(
        'RN21',
        `A data final (${rotuloDaData(ate)}) não pode ser antes da primeira Ocorrência.`,
        CAMPO_ATE,
      ),
    ];
  }
  if (datas.length > limite) {
    return [
      violacao(
        'RN21',
        `A Série cobre no máximo ${limite} semanas: a última Ocorrência pode ser em ${rotuloDaData(datas[limite - 1]!)}.`,
        CAMPO_ATE,
      ),
    ];
  }
  const foraDaSerie = datasExcluidas
    .filter((data) => !datas.includes(data))
    .map((data) =>
      violacao(
        'RN21',
        `${rotuloDaData(data)} não é uma data da Série.`,
        CAMPO_DATAS_EXCLUIDAS,
        data,
      ),
    );
  if (foraDaSerie.length > 0) return foraDaSerie;
  if (datas.every((data) => datasExcluidas.includes(data))) {
    return [
      violacao(
        'RN21',
        'Todas as datas foram desmarcadas: a Série ficaria sem Ocorrência.',
        CAMPO_DATAS_EXCLUIDAS,
      ),
    ];
  }
  return [];
}

/**
 * O que vale para cada Ocorrência, com a `data` dela: RN01, RN03, RN04 e a Antecedência mínima
 * (RN05). A máxima não vale na Série (RN21).
 */
function violacoesDaOcorrencia(
  ocorrencia: Ocorrencia,
  fatos: FatosDaReserva,
  agora: Date,
): Violacao[] {
  return [
    ...semConflito(ocorrencia, fatos.reservasDoRecurso),
    ...dentroDoHorario(ocorrencia, fatos.horarios),
    ...semIndisponibilidade(ocorrencia, fatos.indisponibilidades),
    ...dentroDaAntecedenciaMinima(ocorrencia, fatos.recurso, fatos.politica, agora),
  ].map((violacao) => ({ ...violacao, data: ocorrencia.data }));
}

/**
 * US09: criar uma Série (RN21). Tudo ou nada: se qualquer Ocorrência falhar, nenhuma é criada, e a
 * recusa lista cada data com a sua regra. O que é igual em todas as Ocorrências (RN02, RN06, RN08)
 * aparece uma vez só, sem `data`, e a Série conta 1 na Cota (RN07).
 */
export function decidirSerie(
  fatos: FatosDaReserva,
  pedido: PedidoDeSerie,
  quem: Quem,
  agora: Date,
): DecisaoDaSerie {
  // RN21: só Docentes criam Séries. O Aluno passa pela rota, mas não pela regra (403).
  if (quem.perfil !== 'Docente') {
    return { tipo: 'proibida', violacoes: [violacao('RN21', 'Só Docentes criam Séries.')] };
  }
  const docente = { id: quem.id, perfil: quem.perfil };

  const { ate, datasExcluidas, ...base } = pedido;
  const limite = fatos.politica.semanasMaximasDaSerie;
  const { data: primeira, minutos } = emSaoPaulo(base.inicio);
  const duracao = (base.fim.getTime() - base.inicio.getTime()) / MINUTO;
  const datas = datasDaSerie(primeira, ate, limite + 1);
  const porDatas = datasValidas(datas, pedido, limite);

  // Com a data final errada, não há como saber quais Ocorrências validar.
  const ocorrencias: Ocorrencia[] =
    datas.length > 0 && datas.length <= limite
      ? datas
          .filter((data) => !datasExcluidas.includes(data))
          .map((data) => ({
            data,
            inicio: instanteEmSaoPaulo(data, minutos),
            fim: instanteEmSaoPaulo(data, minutos + duracao),
          }))
      : [];

  const violacoes = [
    ...porDatas,
    ...intervaloValido(base),
    ...dentroDaDuracao(base, docente, fatos.recurso, fatos.politica),
    ...dentroDaCota(fatos.ativasDoUsuario, docente, fatos.politica),
    ...dentroDaCapacidade(base, fatos.recurso),
    ...ocorrencias.flatMap((ocorrencia) => violacoesDaOcorrencia(ocorrencia, fatos, agora)),
  ];
  if (violacoes.length > 0) return { tipo: 'recusada', violacoes };

  // RN10: em Recurso restrito, todas as Ocorrências nascem Pendentes.
  const status = fatos.recurso.restrito ? 'Pendente' : 'Confirmada';
  return {
    tipo: 'aceita',
    efeitos: [
      {
        evento: 'SerieCriada',
        serie: { usuarioId: quem.id, recursoId: base.recursoId, criadaEm: agora },
        ocorrencias: ocorrencias.map(({ inicio, fim }) => ({
          reserva: { ...base, inicio, fim, usuarioId: quem.id, status, criadaEm: agora },
          transicao: { de: null, para: status, em: agora, porId: quem.id },
        })),
      },
    ],
  };
}
