# Reservas do Campus

Sistema web em que alunos e docentes da UNIFESP reservam espaços e equipamentos do campus, e em que gestores aprovam pedidos e acompanham o uso. Projeto da disciplina de Engenharia de Software (2/2026).

**Equipe:** Gustavo, Guilherme, Kaio e Rafael.

## Rodar na sua máquina

Precisa do **Node 24** (a versão está em [`.nvmrc`](.nvmrc); com o nvm, `nvm use`). O `npm install` recusa outra versão. E do **Docker** (Docker Desktop no Windows e no Mac) para o Postgres.

```bash
npm install                   # também gera o client do Prisma
cp .env.example .env          # os valores do exemplo já servem para o banco do compose
docker compose up -d db       # Postgres 16 com os bancos reservas e reservas_teste
npm run db:migrar -w @reservas/api
npm run dev
```

O `npm run dev` sobe a API em <http://localhost:3000> e a tela em <http://localhost:5173>, as duas com recarga automática. A tela chama `/api` na mesma origem e o Vite repassa para a API.

**Tudo com um comando (a demo):** `docker compose up --build` sobe o Postgres e a imagem única da aplicação, a mesma do deploy, em que a API serve a tela na mesma origem: abra <http://localhost:3000>. Ao subir, a imagem aplica as migrações, roda o seed (só com o banco vazio) e liga o servidor com `DEMO=1`. Não precisa de Node nem de `.env`, só do Docker. Ela usa a porta 3000, como o `npm run dev`: rode um ou outro.

**Testes de ponta a ponta:** com a imagem no ar (`docker compose up --build -d --wait`), `npm run test:e2e` roda o Playwright nos projetos `computador` (1280 × 720) e `celular` (360 × 640, com toque). Na primeira vez, baixe o navegador com `npx playwright install chromium` dentro de `e2e/`. Os testes ficam em [`e2e/testes/`](e2e/testes/); para conferir no celular que a página não rola na horizontal (RNF07), use o `conferirSemRolagemHorizontal(page)` de [`ajudantes.ts`](e2e/testes/ajudantes.ts). No CI, o job `e2e` faz o mesmo e guarda o relatório e os traces como artefato `playwright`.

**Banco:** o schema fica em [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma). Mudou o schema? `npm run db:migrar -w @reservas/api` cria a migração (migrações só aditivas). O que o Prisma não modela (a exclusion constraint `reserva_sem_conflito`, os `CHECK`s e os índices únicos parciais) está escrito à mão no fim da [primeira migração](apps/api/prisma/migrations/20261027000000_inicial/migration.sql). `npm run db:semear -w @reservas/api` roda o seed, que só faz algo com o banco vazio. Para recomeçar do zero: `docker compose down -v && docker compose up -d db`.

**Relógio da demo:** com `DEMO=1` no `.env`, a API sobe com o relógio parado em `RELOGIO_FIXO` (por exemplo `2026-11-10T08:00:00-03:00`), e `POST /api/demo/relogio` com `{"avancarMinutos": 60}` ou `{"ir": "2026-11-10T10:16:00-03:00"}` o move (precisa de sessão). Sem `DEMO=1` a rota não existe.

| Endereço | O que é |
|---|---|
| <http://localhost:5173> | A tela |
| <http://localhost:5173/api/health> | `{ status: 'ok', sha }`, o SHA do commit em execução |
| <http://localhost:5173/api/docs> | Swagger UI, gerado dos schemas Zod |
| <http://localhost:5173/api/openapi.json> | O documento OpenAPI |

| Comando | O que faz |
|---|---|
| `npm run lint` | ESLint (com as regras de arquitetura do [ADR 0001](docs/adr/0001-nucleo-funcional-casca-imperativa.md)), Prettier e `tsc` em todos os pacotes |
| `npm run format` | Formata tudo com o Prettier |
| `npm test` | Todas as suítes do Vitest: `nucleo`, `api`, `web`, `quadro` e `matriz` |
| `npm run test:nucleo` | Só o núcleo (sem banco), com cobertura: falha abaixo de 80% de linhas ou de branches em `src/modulos/*/nucleo/` |
| `npm run test:api` | Só a API, no Postgres real. Migra o `DATABASE_URL_TESTE` e cria uma cópia dele por worker (`reservas_teste_1`, `_2`…), esvaziada a cada teste. Sem a variável, os testes com banco são pulados (no CI, falham) |
| `npm run test:e2e` | Playwright contra a imagem no ar (`docker compose up`), no computador e no celular |
| `npm run matriz -- --suite <nome> <resultados.json>` | Monta a matriz RN → testes a partir do relatório JSON do Vitest (o CI põe no resumo de todo PR) |
| `npm run build` | Build da tela |
| `npm run quadro` | Gera o [quadro da equipe no Obsidian](#quadro-da-equipe-no-obsidian) a partir das issues |

**Pastas:** `apps/api` (Fastify), `apps/web` (React), `packages/shared` (schemas Zod de cada rota, o contrato entre as duas), `e2e` (Playwright), `ferramentas/quadro` (o gerador do quadro), `ferramentas/matriz` (a matriz RN → testes do CI) e `docker` (o entrypoint da imagem e o script que cria o banco de teste). A imagem é o [`Dockerfile`](Dockerfile) da raiz. Na API e na tela, o código de cada módulo fica em `src/modulos/{conduta,recursos,reservas,ciclo}/`, e os outros módulos só importam o `index.ts` dele.

### Quadro da equipe no Obsidian

Uma visão local de quem pegou o quê, por incremento e por módulo. A fonte oficial continua sendo o GitHub; nada do quadro é commitado.

1. Baixe o [Obsidian](https://obsidian.md) e abra a pasta do repositório como cofre (*Open folder as vault*).
2. Com o `gh` logado, rode `npm run quadro` sempre que quiser o quadro em dia.
3. Abra `quadro/Quadro.md` (progresso e tabela de tickets), `quadro/Quadro da equipe.canvas` (uma coluna por integrante e uma de Infra) ou a nota de cada integrante.

O `.obsidian/`, os `*.canvas` soltos na raiz e a pasta `quadro/` ficam no `.gitignore`. Os integrantes e o rodízio de revisão ficam em [`ferramentas/quadro/src/equipe.ts`](ferramentas/quadro/src/equipe.ts).

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

1. Atribua o ticket a você no GitHub e mova o card para "Em andamento" no quadro. **No máximo 1 ticket em andamento por pessoa.**
2. Atualize a `main` e crie uma branch para ele no repositório principal (não use fork):
   ```bash
   git switch main
   git pull
   git switch -c feat/<numero>-<nome-curto>
   ```
   O prefixo é o tipo da mudança: `feat`, `fix`, `docs`, `test`, `refactor` ou `chore`.
3. Programe sozinho, ou use `/implement <link do ticket>`. Ele usa TDD, revisa o código e commita **na branch atual**, então crie a branch antes. Mensagens de commit no padrão `tipo(módulo): o que mudou (#numero)`, em português. Exemplo: `feat(m3): valida Conflito na criação de Reserva (#42)`.
4. Abra o PR ligando o ticket (`Closes #<numero>` na descrição). PR pequeno: um ticket por PR, branch com até 2 dias e até umas 400 linhas mudadas. Se crescer além disso, quebre o ticket.
5. **O revisor do rodízio revisa** em até 24h, usando o checklist do template de PR. Revise de verdade: comente, peça mudança quando for o caso. O rodízio está no [§4 dos requisitos](docs/requisitos.md#4-módulos-e-responsáveis); se o revisor não responder em 24h, qualquer outro integrante pode aprovar.
6. Com CI verde e 1 aprovação, **quem abriu o PR** faz o merge por *squash* e apaga a branch. O deploy em produção sai sozinho.

**A `main` quebrou** (CI vermelho ou produção fora do ar)? Ninguém faz outro merge. Quem quebrou, ou quem viu primeiro, abre na hora um PR de revert com a label `incidente`, que tem prioridade sobre qualquer revisão. O conserto vem depois, num PR normal.

**Ritmo:** um incremento por semana, terminando com a tag `v0.N` e uma release no GitHub. Uma call por semana junta a review do incremento, uma retrospectiva de 15 minutos (notas na descrição da release) e o planejamento do próximo. O fluxo completo, com a Definition of Done, está no ticket [Fluxo de Git e revisão do grupo](https://github.com/tapajosgustavo-collab/reservas-campus/issues/14).

### Proteção da `main`, revisão e quadro

Nada vai direto na `main`, nem do admin. O ruleset [`.github/rulesets/protecao-da-main.json`](.github/rulesets/protecao-da-main.json) exige:

- PR com 1 aprovação, merge só por squash, sem push forçado e sem apagar a `main`;
- os checks `lint`, `nucleo`, `api`, `e2e` e `seguranca` verdes (os nomes dos jobs do [`ci.yml`](.github/workflows/ci.yml));
- o CodeQL sem alerta de segurança High ou acima (RNF14). O CodeQL roda no *default setup*, com JavaScript/TypeScript e Actions;
- ninguém na lista de bypass. A aprovação de code owner **não** é exigida: sem resposta do revisor em 24h, qualquer integrante aprova.

Só o dono do repositório muda o ruleset. Mude primeiro o JSON num PR e, depois do merge, aplique com `gh api --method PUT repos/tapajosgustavo-collab/reservas-campus/rulesets/<id> --input .github/rulesets/protecao-da-main.json` (o `<id>` sai de `gh api repos/tapajosgustavo-collab/reservas-campus/rulesets`). Na primeira vez, é `--method POST .../rulesets`.

O revisor do rodízio é pedido sozinho pelo [`CODEOWNERS`](.github/CODEOWNERS): quem revisa cada pasta de módulo, na API e na tela, e os quatro no resto. O PR já abre com o [template](.github/pull_request_template.md) (`Closes #n`, o que mudou, como testar, checklist da Aula 4 e Definition of Done), e bug se relata pelo [template de bug](.github/ISSUE_TEMPLATE/bug.yml) (passos, esperado, obtido).

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
