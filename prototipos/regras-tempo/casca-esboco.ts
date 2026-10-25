// PROTÓTIPO DESCARTÁVEL — esboço da casca imperativa (não compila sozinho: Fastify e Prisma ainda não existem no repo).
// Mostra ONDE o relógio entra e QUEM chama sincronizar(). Toda a decisão fica no nucleo.ts.

export interface Relogio { agora(): Date }

export const relogioDoSistema: Relogio = { agora: () => new Date() }

/** Relógio dos testes de integração e da "máquina do tempo" da demo. */
export class RelogioFixo implements Relogio {
  constructor(private t: Date) {}
  agora() { return this.t }
  ir(para: Date) { this.t = para }
  avancar(minutos: number) { this.t = new Date(this.t.getTime() + minutos * 60_000) }
}

// apps/api/src/app.ts
// export function construirApp({ relogio = relogioDoSistema, prisma }: { relogio?: Relogio; prisma: PrismaClient }) {
//   const app = Fastify()
//   app.decorate('relogio', relogio)
//
//   // 1) Toda requisição (leitura ou escrita) começa sincronizando, na transação do comando:
//   //    o comando e a tela sempre veem o mundo já atualizado até o "agora".
//   //    async function executar(comando) {
//   //      const agora = relogio.agora().getTime()
//   //      return prisma.$transaction(async tx => {
//   //        await sincronizarNoBanco(tx, agora)        // lê vencidos, chama o núcleo, grava os efeitos
//   //        return comando(tx, agora)
//   //      })
//   //    }
//
//   // 2) Um tique a cada 1 minuto faz o mesmo sem ninguém acessar, só para as Notificações saírem na hora.
//   //    Se o servidor dormir (Render Free), o tique perde a vez e a primeira requisição põe tudo em dia.
//   //    const tique = setInterval(() => executar(async () => {}), 60_000)
//   //    app.addHook('onClose', () => clearInterval(tique))
//
//   return app
// }

// Idempotência quando duas requisições sincronizam ao mesmo tempo:
// - UPDATE reserva SET status = 'Expirada' WHERE id = $1 AND status = 'Pendente'  (só um ganha)
// - Penalidade com UNIQUE (reserva_id, motivo); Notificação com UNIQUE (reserva_id, tipo)
// - ou um pg_advisory_xact_lock(42) no começo de sincronizarNoBanco (mais simples para o volume da demo).

// Testes:
// - Unitário (Vitest): chama o núcleo com datas fixas. Ex.: RN15_nao_comparecimento_gera_penalidade_no_fim_da_tolerancia
//     const { mundo } = sincronizar(seed, sp('03/11 10:16'))
// - Integração (Vitest + app.inject): const relogio = new RelogioFixo(sp('03/11 09:00'));
//     const app = construirApp({ relogio, prisma }); ...; relogio.avancar(76); await app.inject({ method: 'GET', url: '/reservas/minhas' })
// - Ponta a ponta (Playwright): a API sobe com RELOGIO_FIXO=... e a rota POST /demo/relogio (só com DEMO=1) avança o relógio.
