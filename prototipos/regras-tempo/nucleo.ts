// PROTÓTIPO DESCARTÁVEL — ticket "Como as regras de tempo rodam e são testadas".
// Núcleo funcional das regras de tempo: só funções puras, sem banco, sem relógio do sistema.
// Todo "agora" chega como parâmetro (RNF02). Instantes em milissegundos desde a época;
// no código real seriam Date / timestamptz.

export type Instante = number
export type TipoRecurso = 'Espaço' | 'Equipamento'
export type Status =
  | 'Pendente' | 'Confirmada' | 'Recusada' | 'Expirada'
  | 'Cancelada' | 'Em uso' | 'Concluída' | 'Não comparecimento'

export interface Recurso { id: string; nome: string; tipo: TipoRecurso; restrito: boolean; gestor: string }

export interface Reserva {
  id: string
  usuario: string
  recurso: string
  inicio: Instante
  fim: Instante
  status: Status
  serie?: string
  checkIn?: Instante
  devolucao?: Instante
  atrasoPenalizado?: boolean // RN17: Devolução atrasada já gerou a Penalidade
  lembreteTratado?: boolean  // US16: lembrete já enviado ou descartado
  encerradaEm?: Instante
}

export type MotivoPenalidade = 'Não comparecimento' | 'Cancelamento tardio' | 'Devolução atrasada'
export interface Penalidade { usuario: string; reserva: string; motivo: MotivoPenalidade; em: Instante; usadaEmSuspensao: boolean }
export interface Suspensao { usuario: string; inicio: Instante; fim: Instante; fimNotificado: boolean }
export interface Notificacao { para: string; em: Instante; processadaEm: Instante; texto: string }

export interface Mundo {
  recursos: Recurso[]
  reservas: Reserva[]
  penalidades: Penalidade[]
  suspensoes: Suspensao[]
  notificacoes: Notificacao[]
}

const MIN = 60_000
const HORA = 60 * MIN
const DIA = 24 * HORA

export const POLITICA = {
  tolerancia: 15 * MIN,           // RN14/RN15
  toleranciaDevolucao: 15 * MIN,  // RN17
  prazoDecisao: 2 * HORA,         // RN12
  cancelamentoSemPenalidade: 2 * HORA, // RN16
  lembrete: 1 * HORA,             // US16
  janelaPenalidades: 30 * DIA,    // RN19
  penalidadesParaSuspensao: 3,
  duracaoSuspensao: 7 * DIA,
}

// ---------------------------------------------------------------------------
// Vencimentos: o que o tempo faz acontecer, cada um com o instante EXATO em que vence.
// ---------------------------------------------------------------------------

export type Regra = 'RN12' | 'RN15' | 'RN17' | 'RN18' | 'RN19' | 'RN23' | 'US16'
export interface Vencimento { em: Instante; regra: Regra; reserva?: string; usuario?: string; descricao: string }
export interface Aplicado extends Vencimento { processadoEm: Instante; resultado: string }

const recursoDe = (m: Mundo, r: Reserva) => m.recursos.find(x => x.id === r.recurso)!

/** Reserva anterior do mesmo Equipamento que ainda está sem Devolução. */
export function anteriorSemDevolucao(m: Mundo, r: Reserva): Reserva | undefined {
  return m.reservas.find(o => o.id !== r.id && o.recurso === r.recurso && o.status === 'Em uso' && o.inicio < r.inicio)
}

/** Todos os vencimentos ainda não aplicados, vencidos ou futuros, em ordem. */
export function vencimentos(m: Mundo): Vencimento[] {
  const vs: Vencimento[] = []
  const seriesVistas = new Set<string>()
  for (const r of m.reservas) {
    const rec = recursoDe(m, r)
    if (r.status === 'Pendente') {
      if (r.serie) {
        // Série em Recurso restrito: todas expiram juntas no Prazo de decisão da primeira (RN21/RN12).
        if (seriesVistas.has(r.serie)) continue
        seriesVistas.add(r.serie)
        const primeira = Math.min(...m.reservas.filter(o => o.serie === r.serie && o.status === 'Pendente').map(o => o.inicio))
        vs.push({ em: primeira - POLITICA.prazoDecisao, regra: 'RN12', reserva: r.id, descricao: `Expiração da Série ${r.serie}` })
      } else {
        vs.push({ em: r.inicio - POLITICA.prazoDecisao, regra: 'RN12', reserva: r.id, descricao: `Expiração do Pedido ${r.id}` })
      }
    }
    if (r.status === 'Confirmada') {
      if (!r.lembreteTratado) vs.push({ em: r.inicio - POLITICA.lembrete, regra: 'US16', reserva: r.id, descricao: `Lembrete 1h antes de ${r.id}` })
      vs.push({ em: r.inicio + POLITICA.tolerancia, regra: rec.tipo === 'Equipamento' ? 'RN23' : 'RN15', reserva: r.id, descricao: `Fim da Tolerância de ${r.id}` })
    }
    if (r.status === 'Em uso' && rec.tipo === 'Espaço') {
      vs.push({ em: r.fim, regra: 'RN18', reserva: r.id, descricao: `Conclusão automática de ${r.id}` })
    }
    if (r.status === 'Em uso' && rec.tipo === 'Equipamento' && !r.atrasoPenalizado) {
      vs.push({ em: r.fim + POLITICA.toleranciaDevolucao, regra: 'RN17', reserva: r.id, descricao: `Fim da Tolerância de Devolução de ${r.id}` })
    }
  }
  for (const s of m.suspensoes) {
    if (!s.fimNotificado) vs.push({ em: s.fim, regra: 'RN19', usuario: s.usuario, descricao: `Fim da Suspensão de ${s.usuario}` })
  }
  // Empate no mesmo instante: ordem fixa das regras, para o resultado não depender da ordem no banco.
  const ordem: Regra[] = ['RN17', 'RN12', 'RN15', 'RN23', 'RN18', 'RN19', 'US16']
  return vs.sort((a, b) => a.em - b.em || ordem.indexOf(a.regra) - ordem.indexOf(b.regra))
}

/**
 * Aplica, em ordem cronológica, todo vencimento com `em <= agora`.
 * Cada efeito leva a data do VENCIMENTO, não a do processamento: rodar às 10h16 ou às 13h
 * dá o mesmo resultado. Rodar de novo com o mesmo `agora` não faz nada (idempotente).
 */
export function sincronizar(m: Mundo, agora: Instante): { mundo: Mundo; aplicados: Aplicado[] } {
  let mundo = m
  const aplicados: Aplicado[] = []
  for (;;) {
    const v = vencimentos(mundo)[0]
    if (!v || v.em > agora) break
    const r = aplicar(mundo, v, agora)
    mundo = r.mundo
    aplicados.push({ ...v, processadoEm: agora, resultado: r.resultado })
  }
  return { mundo, aplicados }
}

function aplicar(m: Mundo, v: Vencimento, agora: Instante): { mundo: Mundo; resultado: string } {
  const r = m.reservas.find(x => x.id === v.reserva)
  const notif = (para: string, texto: string): Notificacao => ({ para, em: v.em, processadaEm: agora, texto })
  switch (v.regra) {
    case 'RN12': {
      const alvo = r!.serie ? m.reservas.filter(o => o.serie === r!.serie && o.status === 'Pendente') : [r!]
      let mundo = m
      for (const o of alvo) mundo = mudar(mundo, o.id, { status: 'Expirada', encerradaEm: v.em })
      mundo = notificar(mundo, notif(r!.usuario, r!.serie ? `Os Pedidos da Série ${r!.serie} expiraram.` : `O Pedido ${r!.id} expirou sem decisão.`))
      return { mundo, resultado: `${alvo.length} Pedido(s) Expirado(s); Intervalo liberado` }
    }
    case 'RN15':
      return naoComparecimento(m, r!, v, agora, notif)
    case 'RN23': {
      const anterior = anteriorSemDevolucao(m, r!)
      if (!anterior) return naoComparecimento(m, r!, v, agora, notif)
      let mundo = mudar(m, r!.id, { status: 'Cancelada', encerradaEm: v.em })
      mundo = notificar(mundo, notif(r!.usuario, `Sua Reserva ${r!.id} foi cancelada pelo sistema: o Equipamento não foi devolvido a tempo. Sem Penalidade.`))
      return { mundo, resultado: `Cancelada pelo sistema (RN23), sem Penalidade: ${anterior.id} ainda sem Devolução` }
    }
    case 'RN17': {
      let mundo = mudar(m, r!.id, { atrasoPenalizado: true })
      mundo = notificar(mundo, notif(r!.usuario, `Devolução atrasada da Reserva ${r!.id}. Penalidade registrada.`))
      mundo = notificar(mundo, notif(recursoDe(m, r!).gestor, `Equipamento da Reserva ${r!.id} não foi devolvido.`))
      mundo = registrarPenalidade(mundo, { usuario: r!.usuario, reserva: r!.id, motivo: 'Devolução atrasada', em: v.em }, agora)
      return { mundo, resultado: 'Devolução atrasada: 1 Penalidade; continua Em uso' }
    }
    case 'RN18':
      return { mundo: mudar(m, r!.id, { status: 'Concluída', encerradaEm: v.em }), resultado: 'Concluída automaticamente' }
    case 'RN19': {
      const mundo = { ...m, suspensoes: m.suspensoes.map(s => s.usuario === v.usuario && s.fim === v.em ? { ...s, fimNotificado: true } : s) }
      return { mundo: notificar(mundo, notif(v.usuario!, 'Sua Suspensão terminou. Você já pode reservar.')), resultado: 'Fim da Suspensão notificado' }
    }
    case 'US16': {
      const mundo = mudar(m, r!.id, { lembreteTratado: true })
      // Lembrete processado tarde demais (servidor dormindo) não é enviado depois do início.
      if (agora >= r!.inicio) return { mundo, resultado: 'Lembrete DESCARTADO: a Reserva já começou' }
      return { mundo: notificar(mundo, notif(r!.usuario, `Lembrete: sua Reserva ${r!.id} começa em 1 hora.`)), resultado: 'Lembrete enviado' }
    }
  }
}

function naoComparecimento(m: Mundo, r: Reserva, v: Vencimento, agora: Instante, notif: (p: string, t: string) => Notificacao) {
  let mundo = mudar(m, r.id, { status: 'Não comparecimento', encerradaEm: v.em })
  mundo = notificar(mundo, notif(r.usuario, `Não comparecimento na Reserva ${r.id}. Penalidade registrada.`))
  mundo = registrarPenalidade(mundo, { usuario: r.usuario, reserva: r.id, motivo: 'Não comparecimento', em: v.em }, agora)
  return { mundo, resultado: 'Não comparecimento: Penalidade e Intervalo liberado' }
}

// ---------------------------------------------------------------------------
// Conduta (RN19, RN20): a Suspensão é guardada com início e fim; "em vigor" é calculado na leitura.
// ---------------------------------------------------------------------------

export function registrarPenalidade(m: Mundo, p: Omit<Penalidade, 'usadaEmSuspensao'>, processadaEm: Instante): Mundo {
  let mundo: Mundo = { ...m, penalidades: [...m.penalidades, { ...p, usadaEmSuspensao: false }] }
  const contam = mundo.penalidades.filter(x =>
    x.usuario === p.usuario && !x.usadaEmSuspensao && x.em > p.em - POLITICA.janelaPenalidades && x.em <= p.em)
  if (contam.length < POLITICA.penalidadesParaSuspensao) return mundo
  mundo = { ...mundo, penalidades: mundo.penalidades.map(x => contam.includes(x) ? { ...x, usadaEmSuspensao: true } : x) }
  const vigente = suspensaoEmVigor(mundo, p.usuario, p.em)
  const fim = Math.max(p.em + POLITICA.duracaoSuspensao, vigente?.fim ?? 0)
  const suspensoes = vigente
    ? mundo.suspensoes.map(s => s === vigente ? { ...s, fim } : s)
    : [...mundo.suspensoes, { usuario: p.usuario, inicio: p.em, fim, fimNotificado: false }]
  mundo = { ...mundo, suspensoes }
  return notificar(mundo, { para: p.usuario, em: p.em, processadaEm, texto: `Você está suspenso até ${fmt(fim)}.` })
}

export function suspensaoEmVigor(m: Mundo, usuario: string, agora: Instante): Suspensao | undefined {
  return m.suspensoes.find(s => s.usuario === usuario && s.inicio <= agora && agora < s.fim)
}

// ---------------------------------------------------------------------------
// Comandos dos Usuários: também puros, também recebem o agora.
// A casca roda sincronizar(agora) ANTES de cada comando, na mesma transação.
// ---------------------------------------------------------------------------

export type Resultado = { ok: true; mundo: Mundo; msg: string } | { ok: false; erro: string }
const falha = (erro: string): Resultado => ({ ok: false, erro })
const ATIVOS: Status[] = ['Pendente', 'Confirmada', 'Em uso']

export function criarReserva(m: Mundo, agora: Instante, d: { id: string; usuario: string; recurso: string; inicio: Instante; fim: Instante }): Resultado {
  const susp = suspensaoEmVigor(m, d.usuario, agora)
  if (susp) return falha(`RN09 · Suspenso não reserva: suspensão em vigor até ${fmt(susp.fim)}`)
  // Simula a exclusion constraint do Postgres: ela só enxerga o Status GRAVADO.
  const choque = m.reservas.find(o => o.recurso === d.recurso && ATIVOS.includes(o.status) && o.inicio < d.fim && d.inicio < o.fim)
  if (choque) return falha(`RN01 · Sem Conflito: o Intervalo se sobrepõe à Reserva ${choque.id} (${choque.status})`)
  const rec = m.recursos.find(x => x.id === d.recurso)!
  const status: Status = rec.restrito ? 'Pendente' : 'Confirmada'
  return { ok: true, mundo: { ...m, reservas: [...m.reservas, { ...d, status }] }, msg: `Reserva ${d.id} criada (${status})` }
}

export function aprovar(m: Mundo, _agora: Instante, id: string): Resultado {
  const r = m.reservas.find(x => x.id === id)!
  if (r.status !== 'Pendente') return falha(`RN12 · Expiração: o Pedido ${id} não está mais Pendente (${r.status})`)
  return { ok: true, mundo: mudar(m, id, { status: 'Confirmada' }), msg: `Pedido ${id} aprovado` }
}

export function fazerCheckIn(m: Mundo, agora: Instante, id: string): Resultado {
  const r = m.reservas.find(x => x.id === id)!
  if (r.status !== 'Confirmada') return falha(`RN14 · Janela de Check-in: a Reserva está ${r.status}`)
  if (agora < r.inicio - POLITICA.tolerancia || agora > r.inicio + POLITICA.tolerancia)
    return falha('RN14 · Janela de Check-in: fora da janela de 15 min antes a 15 min depois do início')
  const anterior = recursoDe(m, r).tipo === 'Equipamento' ? anteriorSemDevolucao(m, r) : undefined
  if (anterior) return falha(`RN23 · Equipamento ainda fora: a Reserva ${anterior.id} ainda não fez a Devolução`)
  return { ok: true, mundo: mudar(m, id, { status: 'Em uso', checkIn: agora }), msg: `Check-in de ${id}` }
}

export function registrarDevolucao(m: Mundo, agora: Instante, id: string): Resultado {
  const r = m.reservas.find(x => x.id === id)!
  if (r.status !== 'Em uso' || recursoDe(m, r).tipo !== 'Equipamento') return falha(`RN17 · Devolução: a Reserva ${id} não é de Equipamento Em uso`)
  return { ok: true, mundo: mudar(m, id, { status: 'Concluída', devolucao: agora, encerradaEm: agora }), msg: `Devolução de ${id}` }
}

export function cancelar(m: Mundo, agora: Instante, id: string): Resultado {
  const r = m.reservas.find(x => x.id === id)!
  if (!['Pendente', 'Confirmada'].includes(r.status) || agora >= r.inicio) return falha(`RN16 · Cancelamento: só antes do início e com Reserva Pendente ou Confirmada (${r.status})`)
  let mundo = mudar(m, id, { status: 'Cancelada', encerradaEm: agora })
  const tardio = r.status === 'Confirmada' && r.inicio - agora < POLITICA.cancelamentoSemPenalidade
  if (tardio) mundo = registrarPenalidade(mundo, { usuario: r.usuario, reserva: id, motivo: 'Cancelamento tardio', em: agora }, agora)
  return { ok: true, mundo, msg: tardio ? `Cancelamento tardio de ${id}: Penalidade` : `Cancelamento de ${id}` }
}

// ---------------------------------------------------------------------------

function mudar(m: Mundo, id: string, campos: Partial<Reserva>): Mundo {
  return { ...m, reservas: m.reservas.map(r => r.id === id ? { ...r, ...campos } : r) }
}
function notificar(m: Mundo, n: Notificacao): Mundo {
  return { ...m, notificacoes: [...m.notificacoes, n] }
}
export function fmt(t: Instante): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(t)
}
