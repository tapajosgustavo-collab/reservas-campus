# Reservas do Campus

## Agent skills

### Issue tracker

As issues ficam no GitHub Issues do `tapajosgustavo-collab/reservas-campus` (via `gh`). Veja `docs/agents/issue-tracker.md`.

### Domain docs

Contexto único: `CONTEXT.md` na raiz e ADRs em `docs/adr/`. Os requisitos ficam em `docs/requisitos.md`. Veja `docs/agents/domain.md`.

## Regras de arquitetura

Valem para todo código do backend. O porquê está em `docs/adr/0001-nucleo-funcional-casca-imperativa.md`.

- **Núcleo puro.** As regras de negócio ficam em `apps/api/src/modulos/<modulo>/nucleo/`, sem Prisma, Fastify, `Date.now()`, `new Date()` sem argumento, ids aleatórios nem `console`. O `agora` e o `quem` (Usuário da sessão) chegam por parâmetro.
- **Decisão como valor.** O núcleo devolve `aceita { efeitos }` ou `recusada { violacoes }`, com todas as RNs violadas, e não lança exceção. A casca carrega os fatos, chama o núcleo e executa os efeitos na transação da requisição.
- **Nada de interface de repositório.** A casca usa o Prisma direto; a única porta é o `Relogio`.
- **Fronteira dos módulos.** Um módulo só importa outro pelo `index.ts` dele, e só o módulo dono grava nas suas tabelas.
- **Toda RN no núcleo**, com teste unitário que tem o id dela no nome (`RN07_...`). O Zod só valida a forma da entrada.
- **Use os termos do `CONTEXT.md`** nos nomes de tipos, funções e testes. Sem abstração especulativa. Rode os testes depois de refatorar.
