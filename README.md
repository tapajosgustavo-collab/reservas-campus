# Reservas do Campus

Sistema web em que alunos e docentes da UNIFESP reservam espaços e equipamentos do campus, e em que gestores aprovam pedidos e acompanham o uso. Projeto da disciplina de Engenharia de Software (2/2026).

**Equipe:** Gustavo, Guilherme, Kaio e Rafael.

> O projeto ainda está na fase de planejamento: não há código ainda. As instruções de como rodar o sistema entram aqui quando o esqueleto estiver pronto.

## Documentos

| Arquivo | O que tem |
|---|---|
| [`CONTEXT.md`](CONTEXT.md) | Glossário do domínio. Use sempre esses termos no código, nas issues e nos PRs. |
| [`docs/requisitos.md`](docs/requisitos.md) | Histórias de usuário, regras de negócio (`RN01`...), requisitos não funcionais e incrementos. |
| [Mapa do planejamento](https://github.com/tapajosgustavo-collab/reservas-campus/issues/1) | Issue com todas as decisões tomadas até agora e o que falta decidir. |
| [`AGENTS.md`](AGENTS.md) e [`docs/agents/`](docs/agents/) | Configuração das skills do Claude Code (issue tracker e docs de domínio). |

**Stack decidida:** TypeScript em monorepo npm (Node 24), Fastify + Zod no backend, React + Vite + Mantine no frontend, PostgreSQL 16 com Prisma, Vitest e Playwright nos testes. Detalhes no mapa.

## Preparar a máquina (uma vez)

1. Aceite o convite do repositório: <https://github.com/tapajosgustavo-collab/reservas-campus/invitations>.
2. Instale o [GitHub CLI](https://cli.github.com/) e faça login:
   ```bash
   gh auth login
   ```
3. Clone o repositório:
   ```bash
   gh repo clone tapajosgustavo-collab/reservas-campus
   ```
4. Instale o [Claude Code](https://claude.com/claude-code) (app desktop ou terminal) e entre com a sua conta.
5. Abra o Claude Code **na pasta do repositório**. As skills do projeto já vêm junto, em [`.claude/skills/`](.claude/skills/), e não precisam de instalação nem de setup.

## Como trabalhar nos tickets

### Fase 1: tickets de decisão (agora)

O planejamento usa a skill **wayfinder**. Cada ticket filho do [mapa](https://github.com/tapajosgustavo-collab/reservas-campus/issues/1) é uma pergunta a decidir. No Claude Code, dentro do repositório, digite:

```
/wayfinder https://github.com/tapajosgustavo-collab/reservas-campus/issues/1
```

- Sem dizer qual ticket, ele pega o próximo livre (aberto, sem bloqueio e sem ninguém atribuído) e atribui a você antes de começar, para ninguém pegar o mesmo.
- Para escolher um ticket, cole o link dele depois do link do mapa.
- **Um ticket por sessão.** Terminou, abra uma sessão nova para o próximo.
- Tickets com **(em grupo)** no título são decididos com os quatro numa call. Uma pessoa conduz a sessão e responde pelo grupo.
- Nos tickets de conversa é **você** quem responde as perguntas. O Claude não decide por você.

No fim, o ticket é fechado com a decisão num comentário, e o mapa ganha uma linha em "Decisions so far".

### Fase 2: tickets de implementação (depois do mapa)

Quando o mapa não tiver mais tickets abertos:

1. Alguém roda `/to-spec`, que junta todas as decisões numa spec publicada como issue.
2. Depois roda `/to-tickets` com o link da spec, pedindo a label `ready-for-human`. Ele quebra a spec em fatias verticais (banco, API, tela e testes), com os bloqueios entre elas.

Para cada ticket de implementação:

1. Atribua o ticket a você no GitHub.
2. Atualize a `main` e crie uma branch para ele:
   ```bash
   git switch main
   git pull
   git switch -c feat/<numero>-<nome-curto>
   ```
3. Programe sozinho, ou use `/implement <link do ticket>`. Ele usa TDD, revisa o código e commita **na branch atual**, então crie a branch antes.
4. Abra o PR ligando o ticket (`Closes #<numero>` na descrição).
5. **Outro integrante revisa** antes do merge. Revise de verdade: comente, peça mudança quando for o caso.

## Skills disponíveis

As skills em `.claude/skills/` são do repositório [mattpocock/skills](https://github.com/mattpocock/skills) (licença MIT, em [`.claude/skills/LICENSE`](.claude/skills/LICENSE)).

| Comando | Para quê |
|---|---|
| `/wayfinder` | Planejar em tickets de decisão (o mapa) |
| `/to-spec` | Juntar a conversa e as decisões numa spec |
| `/to-tickets` | Quebrar a spec em tickets de implementação |
| `/implement` | Implementar um ticket |
| `/tdd` | Desenvolver uma regra com teste primeiro |
| `/grilling`, `/domain-modeling`, `/prototype`, `/research` | Usadas pelo wayfinder; podem ser chamadas sozinhas |
