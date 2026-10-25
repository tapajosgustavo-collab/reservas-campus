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
4. Escolha a sua ferramenta. As skills do projeto ficam em [`.claude/skills/`](.claude/skills/) e seguem o padrão aberto [Agent Skills](https://agentskills.io), então não é obrigatório usar o Claude Code:

   | Ferramenta | O que fazer |
   |---|---|
   | [Claude Code](https://claude.com/claude-code) | Abra **na pasta do repositório**. As skills e o `AGENTS.md` já são lidos, sem instalação nem setup. |
   | [GitHub Copilot](https://code.visualstudio.com/docs/agent-customization/agent-skills) (VS Code ou Copilot CLI, modo agente) | Abra a pasta do repositório. O Copilot já procura skills em `.claude/skills/` e lê o `AGENTS.md`. Estudantes verificados pelo [GitHub Education](https://education.github.com/) podem ter um plano gratuito; confira se está disponível para você. |
   | [OpenAI Codex](https://developers.openai.com/codex/skills) | O Codex lê o `AGENTS.md`, mas procura skills em `.agents/skills/`. Copie uma vez a pasta do projeto para a sua pasta pessoal: `mkdir -p ~/.agents/skills && cp -r .claude/skills/* ~/.agents/skills/`. |
   | Sem IA | Siga o [processo à mão](#sem-ia-o-mesmo-processo-à-mão), descrito mais abaixo. |

   As skills foram escritas para o Claude Code e citam ferramentas dele (como subagentes). As outras ferramentas costumam se adaptar, mas o resultado pode variar um pouco.

## Como trabalhar nos tickets

### Fase 1: tickets de decisão (agora)

O planejamento usa a skill **wayfinder**. Cada ticket filho do [mapa](https://github.com/tapajosgustavo-collab/reservas-campus/issues/1) é uma pergunta a decidir. Na sua ferramenta, dentro do repositório, digite (no Copilot ou no Codex, se o comando não aparecer, peça "use a skill wayfinder com o mapa ..."):

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

### Sem IA: o mesmo processo à mão

As skills são só roteiros. Tudo o que elas fazem dá para fazer direto no GitHub:

**Ticket de decisão**
1. Escolha no mapa um ticket aberto, sem bloqueio (o GitHub mostra "Blocked by" na issue) e sem ninguém atribuído.
2. Atribua o ticket a você.
3. Discuta a pergunta com o grupo. Leia antes o `CONTEXT.md`, o `docs/requisitos.md` e as decisões já tomadas no mapa.
4. Comente a decisão na issue, com o porquê, e feche a issue.
5. Edite o mapa e acrescente, no fim da seção "Decisions so far", uma linha com o link do ticket e um resumo de uma frase da decisão.
6. Se a decisão mudar uma regra ou um termo, atualize o `docs/requisitos.md` ou o `CONTEXT.md` num PR.

**Ticket de implementação:** igual à fase 2 acima, só que programando sem a skill `/implement`. Escreva os testes das regras de negócio junto com o código (de preferência antes, em TDD).

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
