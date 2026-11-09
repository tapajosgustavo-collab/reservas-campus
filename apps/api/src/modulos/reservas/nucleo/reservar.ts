import {
  STATUS_ATIVOS,
  violacao,
  type Horario,
  type Perfil,
  type PerfilQueReserva,
  type Politica,
  type Status,
  type TipoRecurso,
  type Violacao,
} from '@reservas/shared';
import { emSaoPaulo } from '../../../comum/instante';

/** O Usuário da sessão. */
export interface Quem {
  id: number;
  perfil: Perfil;
}

/** O Gestor não cria Reservas: a rota só deixa passar Aluno e Docente. */
type QuemReserva = Quem & { perfil: PerfilQueReserva };

/** As RNs do Intervalo marcam Início e Fim juntos na tela. */
const CAMPO_DO_INTERVALO = 'intervalo';
const CAMPO_DE_PARTICIPANTES = 'participantes';

const NOME_DO_TIPO: Record<TipoRecurso, string> = { Espaco: 'Espaço', Equipamento: 'Equipamento' };

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;
const MEIA_HORA = 30;

/** Um Intervalo pedido ou buscado. */
export interface Intervalo {
  inicio: Date;
  fim: Date;
}

export interface PedidoDeReserva {
  recursoId: number;
  inicio: Date;
  fim: Date;
  participantes?: number;
  finalidade?: string;
}

/** O que a decisão precisa saber de cada Reserva do Recurso em volta do Intervalo. */
export interface ReservaDoRecurso {
  inicio: Date;
  fim: Date;
  status: Status;
}

/** Uma Reserva ativa de quem está reservando, para a Cota. */
export interface ReservaNaCota {
  id: number;
  serieId: number | null;
}

/** O que decide se o Recurso pode ser usado no Intervalo. */
export interface FatosDoIntervalo {
  horarios: Horario[];
  reservasDoRecurso: ReservaDoRecurso[];
}

export interface FatosDaReserva extends FatosDoIntervalo {
  /** `capacidade` é `null` só em Equipamento. */
  recurso: { tipo: TipoRecurso; capacidade: number | null };
  /** Só as Reservas ativas (Pendente, Confirmada e Em uso) de quem está reservando. */
  ativasDoUsuario: ReservaNaCota[];
  politica: Politica;
}

export interface ReservaCriada {
  evento: 'ReservaCriada';
  reserva: PedidoDeReserva & { usuarioId: number; status: Status; criadaEm: Date };
  transicao: { de: null; para: Status; em: Date; porId: number };
}

/** A Reserva muda de Status, com a linha do histórico. Quem decide é outro módulo (o Check-in é do M4). */
export interface StatusMudou {
  evento: 'StatusMudou';
  reservaId: number;
  transicao: { de: Status; para: Status; em: Date; porId: number };
}

export type Efeito = ReservaCriada | StatusMudou;

export type Decisao =
  { tipo: 'aceita'; efeitos: [Efeito] } | { tipo: 'recusada'; violacoes: Violacao[] };

/** 600 → "10:00"; 1440 → "24:00". */
function rotulo(minutos: number) {
  const horas = String(Math.floor(minutos / 60)).padStart(2, '0');
  return `${horas}:${String(minutos % 60).padStart(2, '0')}`;
}

function dasAte({ inicio, fim }: { inicio: Date; fim: Date }) {
  return `das ${rotulo(emSaoPaulo(inicio).minutos)} às ${rotulo(emSaoPaulo(fim).minutos)}`;
}

function ehAtiva({ status }: ReservaDoRecurso) {
  return (STATUS_ATIVOS as readonly Status[]).includes(status);
}

/** Intervalos que só se encostam não se sobrepõem. */
function seSobrepoem(a: { inicio: Date; fim: Date }, b: { inicio: Date; fim: Date }) {
  return a.inicio < b.fim && b.inicio < a.fim;
}

/** O Intervalo em minutos do dia; `null` se o fim não vem depois do início no mesmo dia. */
function noDia({ inicio, fim }: Intervalo) {
  if (fim <= inicio) return null;
  const { data, diaSemana, minutos } = emSaoPaulo(inicio);
  // Terminar à meia-noite é ainda o mesmo dia: quem olha o dia é o último instante do Intervalo.
  if (emSaoPaulo(new Date(fim.getTime() - 1)).data !== data) return null;
  return { diaSemana, de: minutos, ate: minutos + (fim.getTime() - inicio.getTime()) / MINUTO };
}

/** RN02. */
function intervaloValido(pedido: Intervalo): Violacao[] {
  const dia = noDia(pedido);
  if (dia && dia.de % MEIA_HORA === 0 && dia.ate % MEIA_HORA === 0) return [];
  return [
    violacao(
      'RN02',
      'O fim precisa ser depois do início, no mesmo dia, e as duas pontas em múltiplos de 30 minutos.',
      CAMPO_DO_INTERVALO,
    ),
  ];
}

/** RN03. Um Intervalo sem dia (RN02) não tem Horário de funcionamento para conferir. */
function dentroDoHorario(pedido: Intervalo, horarios: Horario[]): Violacao[] {
  const dia = noDia(pedido);
  if (!dia) return [];
  const faixa = horarios.find(({ diaSemana }) => diaSemana === dia.diaSemana);
  if (!faixa) return [violacao('RN03', 'O Recurso não abre neste dia.', CAMPO_DO_INTERVALO)];
  if (faixa.abre <= dia.de && dia.ate <= faixa.fecha) return [];
  const { abre, fecha } = faixa;
  return [
    violacao(
      'RN03',
      `Neste dia o Recurso funciona das ${rotulo(abre)} às ${rotulo(fecha)}.`,
      CAMPO_DO_INTERVALO,
    ),
  ];
}

/** RN01: uma violação só, com todos os horários ocupados e sem dizer quem (RN22). */
function semConflito(pedido: Intervalo, reservas: ReservaDoRecurso[]): Violacao[] {
  if (pedido.fim <= pedido.inicio) return [];
  const conflitos = reservas.filter((reserva) => ehAtiva(reserva) && seSobrepoem(pedido, reserva));
  if (conflitos.length === 0) return [];
  const horarios = conflitos.map(dasAte).join(', ');
  return [violacao('RN01', `Este Recurso já está ocupado ${horarios}.`, CAMPO_DO_INTERVALO)];
}

/**
 * RN01, RN02 e RN03: o que impede usar o Recurso no Intervalo. O reservar (US08) e a busca de
 * Recurso livre (US06, no M2) usam a mesma regra.
 */
export function violacoesDoIntervalo(intervalo: Intervalo, fatos: FatosDoIntervalo): Violacao[] {
  return [
    ...semConflito(intervalo, fatos.reservasDoRecurso),
    ...intervaloValido(intervalo),
    ...dentroDoHorario(intervalo, fatos.horarios),
  ];
}

/** RN05. A Antecedência mínima também recusa início já passado. */
function dentroDaAntecedencia(
  { inicio }: Intervalo,
  { perfil }: QuemReserva,
  { antecedenciaMinimaMin, antecedenciaMaximaDias }: Politica,
  agora: Date,
): Violacao[] {
  const antecedencia = inicio.getTime() - agora.getTime();
  if (antecedencia < antecedenciaMinimaMin * MINUTO) {
    const horas = antecedenciaMinimaMin / 60;
    return [
      violacao(
        'RN05',
        `O início precisa ser pelo menos ${horas}h depois de agora.`,
        CAMPO_DO_INTERVALO,
      ),
    ];
  }
  const dias = antecedenciaMaximaDias[perfil];
  if (antecedencia <= dias * DIA) return [];
  return [
    violacao(
      'RN05',
      `O início pode ser no máximo ${dias} dias depois de agora.`,
      CAMPO_DO_INTERVALO,
    ),
  ];
}

/**
 * RN07: a Cota conta as Reservas ativas, e as Ocorrências de uma mesma Série contam como uma só
 * (RN21). A chave separa Série e Reserva, porque os ids delas vêm de sequências diferentes.
 */
function dentroDaCota(
  ativas: ReservaNaCota[],
  { perfil }: QuemReserva,
  { cota }: Politica,
): Violacao[] {
  const usadas = new Set(
    ativas.map(({ id, serieId }) => (serieId !== null ? `s${serieId}` : `r${id}`)),
  ).size;
  const limite = cota[perfil];
  if (usadas < limite) return [];
  return [
    violacao(
      'RN07',
      `Você já tem ${usadas} ${usadas === 1 ? 'Reserva ativa' : 'Reservas ativas'}, e a Cota de ${perfil} é ${limite}.`,
    ),
  ];
}

/** RN06. Um Intervalo sem dia (RN02) não tem duração para conferir. */
function dentroDaDuracao(
  pedido: Intervalo,
  { perfil }: QuemReserva,
  { tipo }: FatosDaReserva['recurso'],
  { duracaoMaximaMin }: Politica,
): Violacao[] {
  const dia = noDia(pedido);
  if (!dia) return [];
  const maxima = duracaoMaximaMin[tipo][perfil];
  if (dia.ate - dia.de <= maxima) return [];
  return [
    violacao(
      'RN06',
      `A Duração máxima de ${perfil} em ${NOME_DO_TIPO[tipo]} é ${maxima / 60}h.`,
      CAMPO_DO_INTERVALO,
    ),
  ];
}

/** RN08. Só Espaço tem Capacidade, e quem reserva informa os participantes. */
function dentroDaCapacidade(
  { participantes }: PedidoDeReserva,
  { capacidade }: FatosDaReserva['recurso'],
): Violacao[] {
  if (capacidade === null) return [];
  if (participantes === undefined) {
    return [violacao('RN08', 'Informe o número de participantes.', CAMPO_DE_PARTICIPANTES)];
  }
  if (participantes <= capacidade) return [];
  return [
    violacao('RN08', `Este Espaço comporta até ${capacidade} pessoas.`, CAMPO_DE_PARTICIPANTES),
  ];
}

/** US08: criar uma Reserva. Devolve todas as RNs violadas, não só a primeira. */
export function decidirReserva(
  fatos: FatosDaReserva,
  pedido: PedidoDeReserva,
  quem: QuemReserva,
  agora: Date,
): Decisao {
  const violacoes = [
    ...violacoesDoIntervalo(pedido, fatos),
    ...dentroDaAntecedencia(pedido, quem, fatos.politica, agora),
    ...dentroDaDuracao(pedido, quem, fatos.recurso, fatos.politica),
    ...dentroDaCota(fatos.ativasDoUsuario, quem, fatos.politica),
    ...dentroDaCapacidade(pedido, fatos.recurso),
  ];
  if (violacoes.length > 0) return { tipo: 'recusada', violacoes };

  const status = 'Confirmada';
  return {
    tipo: 'aceita',
    efeitos: [
      {
        evento: 'ReservaCriada',
        reserva: { ...pedido, usuarioId: quem.id, status, criadaEm: agora },
        transicao: { de: null, para: status, em: agora, porId: quem.id },
      },
    ],
  };
}
