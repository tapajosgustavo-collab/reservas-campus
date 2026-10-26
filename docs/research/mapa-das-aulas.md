# Pesquisa: mapa das práticas de cada aula no projeto

> Ticket: [#10](https://github.com/tapajosgustavo-collab/reservas-campus/issues/10) · Mapa: [#1](https://github.com/tapajosgustavo-collab/reservas-campus/issues/1)
> Fontes lidas em **2026-10-26**: o PDF da Aula 1 e o texto-fonte de cada um dos 12 Gemini Notebooks das Aulas 2 a 13 (conta da UNIFESP), além das leituras extras públicas listadas no `aulas/00-indice.md`. Estado do projeto comparado: `docs/requisitos.md` v0.1 e `CONTEXT.md` da `main` (commit `bee4edb`), mapa #1 e tickets abertos #11, #13, #14 e #15.

## Pergunta

Para cada aula da disciplina, qual prática ou conceito ela ensina, e onde isso entra no Reservas do Campus (requisitos, modelagem, arquitetura, testes, processo, documentação)? O que já está coberto pelo `docs/requisitos.md` ou por algum ticket do mapa, e o que falta?

## Resposta curta

- **O projeto já cobre bem as Aulas 2, 3, 5 e 8:** incrementos verticais com release (§9), YAGNI no "Fora do escopo" (§3), linguagem ubíqua no `CONTEXT.md`, histórias com regras `RNxx` e exemplos que já são casos de teste, e o fluxo grilling → `/to-spec` → `/to-tickets`.
- **As Aulas 4, 6, 7, 9 e 10 dão a resposta quase pronta para os quatro tickets abertos** (ver [Orientação por ticket aberto](#orientação-por-ticket-aberto)):
  - **#14 Git:** branches de vida curta, PRs pequenos e revisão como conversa (Ship/Show/Ask).
  - **#11 Arquitetura:** monólito modular (M1 a M4) com Functional Core / Imperative Shell. O `sincronizar(mundo, agora)` do #12 já segue esse padrão.
  - **#13 Testes:** separar testes sem I/O (core, com TDD) de testes com I/O (Fastify `inject` + Postgres real) e E2E, testando comportamento sem mocks.
  - **#15 Deploy:** deploy contínuo da `main` depois do CI verde, rollback conhecido, migrações compatíveis e métricas DORA.
- **Lacunas reais (nenhum ticket cobre):** observabilidade (Aula 11), segurança automatizada e autorização explícita (Aula 12), métricas DORA (Aula 10), RNFs verificáveis de desempenho e confiabilidade (Aulas 8 e 12) e documentação de decisões e de operação, como ADRs e o roteiro da demo (Aulas 8 e 13).

## Fontes e acesso

| Aula | Fonte lida | Situação |
|---|---|---|
| 01 | PDF local `aulas/01-historia-da-engenharia-de-software.pdf` (15 slides) | Lido inteiro |
| 02 a 13 | Fonte principal de cada notebook (texto da aula), aberta no NotebookLM em modo leitura | **Todos lidos.** No notebook da Aula 03, só a fonte "Aula 3 — Como uma equipe de software trabalha" foi lida inteira. A segunda fonte ("A product brief for tech companies…") entrou só pelo resumo do notebook |
| 04 | [Ship / Show / Ask (Fowler)](https://martinfowler.com/articles/ship-show-ask.html) | Lido |
| 05 | [Is High Quality Software Worth the Cost? (Fowler)](https://martinfowler.com/articles/is-quality-worth-cost.html) e [mattpocock/skills — engineering](https://github.com/mattpocock/skills/tree/main/skills/engineering) | Lidos |

A numeração interna dos textos não bate com o índice. O notebook da Aula 10 traz "Aula 9 — Continuous Integration" e "Aula 10 — Continuous Delivery". Os das Aulas 12 e 13 se chamam "Aula 14" e "Aula 15". Este documento segue a numeração do `00-indice.md`. Os notebooks só abrem com a conta da UNIFESP, então os links não funcionam para quem está fora da turma.

## O que cada aula ensina

**Aula 01. História da Engenharia de Software** (PDF). A história da área é uma corrida entre a complexidade dos sistemas e novas camadas de abstração: programação estruturada, OO e funcional, design patterns, testes automatizados (JUnit, 1997), Ágil, refactoring e DDD (1999 a 2004), DevOps e CI/CD, e por fim a engenharia assistida por IA e por agentes. Para o projeto, isso serve como enquadramento e não como prática específica. A camada de IA já aparece no uso das skills e do wayfinder.

**Aula 02. Software como produto.** Uma estimativa é uma hipótese, não uma previsão. Software é produto (problema → hipótese → construção → feedback → aprendizado), não projeto com fim. O feedback tardio custa caro. Os conceitos centrais são Build → Measure → Learn, output × outcome e o plano como hipótese. Outras ideias da aula:
- Incrementos devem ser **utilizáveis**. O texto dá como exemplo justamente "Sprint 1: usuário consegue realizar uma reserva simples", contra "Sprint 1: banco de dados".
- Small batches, simplicidade e YAGNI.
- "Continuous attention to technical excellence and good design enhances agility" (princípio 9 do Manifesto Ágil).

**Aula 03. Processo ágil: como equipes desenvolvem software.** Começar pelo problema e não pela tarefa. O backlog é uma lista ordenada e emergente, com priorização por valor, urgência, risco, aprendizado e dependências. A User Story é um "chunk of desired behavior" que abre uma conversa, não uma especificação. O trabalho se divide em **fatias verticais** e pequenos lotes. A aula também cobre:
- WIP (terminar antes de começar), filas, gargalos e fluxo × ocupação individual.
- Agile ≠ Scrum. Os eventos do Scrum (Planning, Daily, Review, **Retrospectiva**).
- **Definition of Done**: implementado, testado, revisado, integrado, documentação atualizada, pronto para entrega.
- "Scrum organiza o trabalho, não substitui engenharia."

**Aula 04. Git e colaboração.** Git como ferramenta de coordenação e não como backup. O commit é uma unidade de pensamento ("o que mudou e por quê"), e o histórico funciona como narrativa e memória da equipe. Branch é uma referência a uma linha de commits. Merge e conflitos aparecem naturalmente, e resolver conflito exige entender o domínio. Outros pontos:
- O PR é um mecanismo de colaboração. Code review serve para melhorar a mudança, não para achar culpados, e tem um checklist: correção, design, complexidade, testes, legibilidade, manutenibilidade, segurança e compatibilidade.
- PRs pequenos. Branches long-lived causam problemas.
- **Trunk-Based Development** com branches curtas, o que não exclui PR nem review. Feature flags para integrar algo incompleto.
- Leitura extra **Ship/Show/Ask**: *Ship* faz merge direto, *Show* abre PR e faz merge sem esperar review, *Ask* espera o review. A regra do artigo é que "review or approval should not be required to merge", com a `main` sempre liberável e branches curtas. Exigir aprovação é tratado como "band-aid" para falta de confiança, mas o próprio artigo diz que equipes novas devem usar mais Show e Ask.

**Aula 05. Software sustentável: projetar para mudanças baratas.** A pergunta da aula é quanto custa mudar o software. Os temas:
- As 4 regras de Simple Design de Beck (passa nos testes, sem duplicação, expressa a intenção, mínimo de elementos).
- Legibilidade e **naming** com termos do domínio ("código legível é também contexto para a IA").
- Coesão alta e acoplamento baixo.
- **DRY como duplicação de conhecimento**, não de linhas.
- Complexidade essencial × acidental, abstrações com custo, YAGNI × optionality ("não construa o futuro; não feche o futuro"), encapsulamento, SOLID como heurística.
- Refactoring com testes como rede de segurança.
- Na era da IA, princípios viram **rules e skills** para agentes.

A leitura de Fowler argumenta que o custo da qualidade interna é negativo: código ruim atrasa a equipe em semanas, não em meses.

**Aula 06. Arquitetura de software.** Arquitetura existe para reduzir o custo de mudar de ideia e o *blast radius* de cada mudança. Fronteiras importam mais que camadas. Os temas:
- A **Dependency Rule**: o domínio não conhece PostgreSQL nem HTTP.
- Ports & Adapters e **Functional Core / Imperative Shell** ("o core decide, o shell executa"), com o TDD como feedback arquitetural.
- Microservices como ferramenta de autonomia organizacional, o risco do monólito distribuído e o banco compartilhado como sinal de alerta.
- **Monolith First** e o **monólito modular** com APIs internas explícitas.
- DORA (loosely coupled).
- Arquitetura avaliada por mudabilidade, testabilidade, deployability, observabilidade, resiliência e autonomia.

**Aula 07. Functional Core / Imperative Shell (aprofundamento).** Efeitos colaterais incluem banco, e-mail, log, `new Date()` e `randomUUID`. O core é feito de funções puras com entradas e saídas explícitas, e a **decisão vira um valor** (discriminated union em TypeScript). Outros pontos:
- Efeitos podem ser representados como dados e executados pelo shell.
- `async` e `void` em código de negócio são sinais de alerta. Resultados ficam como valores, sem exceções.
- O fluxo é I/O → Core → I/O → Core → I/O.
- Testes do core não usam mocks.
- "O Core não pergunta ao mundo; o Shell pergunta e entrega os fatos."

O exercício da aula é `reserve(customerId, roomId, nights)` → `decideReservation(...)`, quase o motor do nosso M3.

**Aula 08. Requisitos e modelagem de domínio.** O problema é o entendimento compartilhado, não a falta de documento. A aula separa discovery de specification. Requisitos funcionais e não funcionais **precisam ser verificáveis** (por exemplo, "500 ms para 95% das requisições"). Os temas:
- A story como convite à conversa, e critérios de aceitação Given/When/Then (Specification by Example).
- Ambiguidade como sinal de que o domínio ainda não foi entendido.
- DDD, **Ubiquitous Language** e EventStorming.
- No fluxo de IA: `/grill-with-docs` (`CONTEXT.md` + `docs/adr/`), `/to-spec` com "Out of scope", `/to-tickets` em fatias verticais. "AI cannot decide what the business actually means."

**Aula 09. Testes como feedback.** "Testing is feedback." Os temas:
- Testar **comportamento observável, não implementação**.
- Trocar a discussão unit × integration pela distinção de Ted Young, **I/O-free × I/O-dependent**.
- Os testes de integração pegam SQL, schema e configuração. O E2E é valioso, mas é caro e difícil de diagnosticar.
- A pirâmide é uma **heurística**, não uma lei.
- Test doubles (stub responde, mock verifica interação). O excesso de mocks gera testes frágeis.
- **Testabilidade é design.** TDD red → green → refactor como ciclo de design.

**Aula 10. CI/CD e DORA.** CI é uma prática e não "ter um pipeline". A ideia é integrar pequenas mudanças na linha principal com feedback em minutos. Os temas:
- Artefato versionado ("build once, deploy many") e quality gates, equilibrando confiança e velocidade.
- **Build quebrado: restaurar o verde primeiro** (corrigir ou reverter).
- Feature flags.
- CI ≠ Continuous Delivery ≠ Continuous Deployment. Deployment pipeline, poucos ambientes parecidos com produção, deploy pequeno e frequente.
- Canary e blue/green. **Rollback planejado**. Migrações **expand → migrate → contract**.
- **Métricas DORA** de throughput (deployment frequency, lead time) e de estabilidade (change failure rate, time to restore), usadas para aprender e não para ranquear pessoas.

**Aula 11. Observabilidade e confiabilidade.** "Seu deploy passou em todos os testes. Como você sabe se deu certo?" Os temas:
- Monitoring diz que existe um problema. Observability ajuda a investigar o porquê.
- **Logs estruturados**, métricas (latência, tráfego, erros, saturação), traces, OpenTelemetry e Grafana.
- Alertas **acionáveis** e alert fatigue.
- **SLI, SLO e SLA**, error budget.
- Incidente: restaurar primeiro. MTTR e rollback. Postmortem *blameless*.
- Métricas de negócio ("o sistema pode estar saudável e o produto quebrado").
- **Instrumentação como parte do design** e Done = código + testes + deploy + observabilidade + alerta + estratégia de recuperação.
- O modelo atual do DORA tem 5 métricas: lead time, deployment frequency, change fail rate, failed deployment recovery time e deployment rework rate.

**Aula 12. Segurança e qualidade.** Os temas:
- **Security by design**: least privilege, defense in depth, secure defaults, fail securely, superfície mínima.
- **Secrets** fora do código e do Git, sem aparecer em logs, com rotação.
- **Supply chain**: lockfile, Dependabot, `npm audit`.
- **Autenticação × autorização**. A autorização acontece no backend, em toda operação, sem confiar no `userId` enviado pelo cliente. Esconder o botão não protege nada.
- Validação de entrada no backend e consultas parametrizadas.
- OWASP Top 10:2025: Broken Access Control, Misconfiguration, Supply Chain, Injection, Authentication Failures.
- Uma lista mínima de controles no CI para projeto acadêmico.
- Qualidade além de bugs (ISO/IEC 25010:2023): correção, confiabilidade, desempenho, segurança, manutenibilidade, usabilidade.
- Transformar afirmações vagas em **critérios verificáveis**.
- A aula traz um **checklist para os projetos** (lista na seção 5 do texto).

**Aula 13. Engenharia de software em escala.** Escala do código, da organização e do tempo. Os temas:
- Monorepo × multirepo: o critério é o custo de mudança.
- Bibliotecas compartilhadas precisam de dono, compatibilidade e depreciação.
- Build e gerenciamento de dependências: reprodutibilidade, lockfiles, versões de ferramenta controladas.
- Platform engineering e **Developer Experience** (tempo até rodar o projeto, tempo de feedback, espera por review).
- Documentação de uso, arquitetural, **operacional** e **ADRs**.
- Padrões técnicos (obrigatórios, recomendados, locais) e governança com verificações automatizadas.
- **Lei de Conway**: equipes por capacidade de negócio (stream-aligned) e Team Topologies.

## Tabela: aula → prática → onde entra → cobertura

Legenda: ✅ coberto · 🟡 parcial ou só como pergunta em ticket aberto · ❌ não coberto.

| Aula | Prática | Onde entra no Reservas do Campus | Coberto? |
|---|---|---|---|
| 01 | Camadas de abstração e engenharia assistida por IA | Processo: skills do repositório, wayfinder, `/implement` | ✅ README (Skills disponíveis), mapa #1 |
| 02 | Incrementos utilizáveis e pequenos lotes | Processo: entregas 0 a 5 com release ao fim de cada uma | ✅ requisitos §9 |
| 02 | YAGNI e simplicidade | Requisitos: o que fica fora | ✅ requisitos §3 (Fora do escopo) |
| 02 | Feedback barato antes de construir | Requisitos e UI: protótipo das telas | ✅ #8 (protótipo, fechado) |
| 02 | Output × outcome, Build → Measure → Learn | Produto: medir se o sistema resolve o problema da §1 (Reservas duplicadas, salas vazias, atrasos, Gestor sem visão de uso) | ❌ Nenhuma métrica de resultado nem feedback de usuários previstos |
| 03 | User Stories como conversa + regras | Requisitos | ✅ US01 a US16, RN01 a RN23 |
| 03 | Fatias verticais por módulo | Processo e tickets | ✅ requisitos §4 (M1 a M4), README fase 2 (`/to-tickets`) |
| 03 | Backlog priorizado, sprints, quadro | Processo | 🟡 #14 (duração das sprints, GitHub Projects) |
| 03 | Limite de WIP | Processo: quadro do GitHub Projects | ❌ Não está na pergunta do #14 |
| 03 | Definition of Done | Processo: template de PR / quadro | ❌ Não está na pergunta do #14 |
| 03 | Retrospectiva e Review por incremento | Processo: fim de cada release | 🟡 Release por incremento (§9). Retrospectiva não prevista |
| 04 | Commits pequenos e mensagens claras | Processo | 🟡 #14 (padrão de mensagem). Os commits atuais já usam `docs:` e `chore:` |
| 04 | Branches de vida curta / trunk-based | Processo | 🟡 #14 (nomes de branch). README fase 2 já usa `feat/<numero>-<nome>` |
| 04 | PR + code review com checklist | Processo: template de PR | 🟡 #14 (templates, regras de revisão), RNF04 (1 aprovação), requisitos §4 (revisor de outro módulo) |
| 04 | Ship/Show/Ask | Processo: quando o review bloqueia o merge | 🟡 RNF04 hoje exige "Ask" sempre. A decisão fica para o #14 |
| 04 | Feature flags | Processo/código: integrar o incompleto (por exemplo Séries, incremento 5 opcional) | ❌ (provavelmente YAGNI. Decidir no #14 ou no #15) |
| 04 | `git worktree` + agentes | Processo: vários agentes em paralelo | ❌ (opcional) |
| 05 | Naming com a linguagem do domínio | Código, testes, issues | ✅ `CONTEXT.md` (termos com "Evitar"), mapa #1 (Notes) |
| 05 | DRY de conhecimento / optionality | Política em dados, não no código | ✅ requisitos (aviso no topo: valores na Política). #8: a agenda não pré-bloqueia pela Política, então a regra não se duplica no front |
| 05 | Rules e skills para agentes | `AGENTS.md`, `.claude/skills/` | 🟡 Existe a configuração, mas não há regras de design do projeto para os agentes |
| 05 | Refactoring com rede de testes | Implementação | 🟡 Skill `/tdd` e `/implement`. Depende do #13 |
| 06 | Monólito modular com fronteiras explícitas | Arquitetura: M1 a M4 dentro de um backend | 🟡 #11 (pergunta). Monorepo decidido em #2 |
| 06 | Dependency Rule / Ports & Adapters | Arquitetura: domínio sem Prisma e sem Fastify | 🟡 #11 ("hexagonal" está na pergunta) |
| 06 | Functional Core / Imperative Shell | Arquitetura: regras puras + shell com transação | 🟡 #12 (`sincronizar(mundo, agora)` puro, `Relogio` injetado), RNF02. Falta estender ao resto (#11) |
| 07 | Decisão como valor (discriminated union), sem exceção | Motor de reservas: devolver **todas** as RNs violadas | 🟡 #8 (lista `RNxx · Nome: mensagem`), US08, RNF09. O formato no core fica para o #11 |
| 07 | Efeitos como dados | Penalidade, Notificação, Cancelamento pelo sistema devolvidos pelo core e executados pelo shell | 🟡 #12 (o tique só emite Notificações). Formalizar no #11 |
| 07 | "Agora" é entrada do core | Regras de tempo | ✅ RNF02, #12 (`RelogioFixo`, `POST /demo/relogio` só com `DEMO=1`) |
| 08 | Linguagem ubíqua + glossário | Modelagem | ✅ `CONTEXT.md` |
| 08 | Discovery por interrogação (grill) | Processo de decisão | ✅ Tickets `wayfinder:grilling` (#2, #4 a #7) |
| 08 | Specification by Example | Requisitos: exemplos nas RNs viram testes | ✅ requisitos §6 ("Os exemplos abaixo já são casos de teste prontos") |
| 08 | Spec → tickets em fatias verticais | Processo | ✅ README fase 2, destino do mapa #1 |
| 08 | RNF verificável (métrica, limite, condição) | Requisitos não funcionais | ❌ RNF07 ("funciona no celular") é vago. Não há RNF de desempenho nem de confiabilidade |
| 08 | ADRs em `docs/adr/` | Documentação de decisões | ❌ `docs/adr/` não existe. As decisões estão só nos comentários das issues |
| 09 | Testes sem I/O × com I/O × E2E | Estratégia de testes | 🟡 #13 (pergunta), #2 (Vitest + `inject` em Postgres real + Playwright), RNF01, RNF03 |
| 09 | Testar comportamento, evitar mocks | Testes do core e da API | 🟡 #13. Postgres real já foi decidido em #2 |
| 09 | TDD red → green → refactor | Implementação das RNs | 🟡 #13 ("em que partes o grupo usa TDD"), skill `/tdd` |
| 09 | Pirâmide como heurística / cobertura | Meta de cobertura | 🟡 RNF01 (80% nas regras), #13 |
| 10 | CI em todo PR, verde obrigatório | GitHub Actions | ✅ RNF04 |
| 10 | Restaurar o build quebrado primeiro | Processo da equipe | ❌ (cabe no #14) |
| 10 | Deploy contínuo da `main` | Render + Cloudflare Pages + Neon | 🟡 #15 (pergunta), #9 (hospedagem decidida) |
| 10 | Rollback e migrações expand/contract | Pipeline e Prisma | ❌ (cabe no #15) |
| 10 | Métricas DORA | Processo e apresentação | ❌ |
| 11 | Logs estruturados com eventos de domínio | Backend (shell) | ❌ |
| 11 | Health check, métricas, alertas acionáveis | Deploy da demo | ❌ |
| 11 | SLI/SLO e error budget | RNF | ❌ |
| 11 | Incidente, rollback, postmortem | Processo (falha antes ou durante a demo) | ❌ |
| 12 | Autorização no backend em toda operação | API: RN13, RN14 (só o dono), RN22, `userId` vindo da sessão | 🟡 RN13, RN14, RN22. RN16 e US13 não dizem que só o dono cancela (os Atores dizem "cancela as próprias Reservas"). Login: #11 |
| 12 | Login sem senha como risco consciente | US01, #11 (login fictício) | 🟡 US01, fora do escopo SSO (§3). O risco não está registrado |
| 12 | Secure defaults | Rota de demo do relógio | ✅ #12 (só com `DEMO=1`) |
| 12 | Secrets fora do Git | `DATABASE_URL` do Neon, hooks do Render | 🟡 #15 ("como os segredos são guardados") |
| 12 | Supply chain (lockfile, Dependabot, `npm audit`) | CI | ❌ |
| 12 | Validação de entrada e consultas parametrizadas | API | ✅ #2 (Zod nos schemas, Prisma) |
| 12 | Defense in depth | RN01 no core **e** na exclusion constraint do Postgres | ✅ #2 (exclusion constraint contra Conflito) |
| 12 | Qualidade em 6 dimensões e critérios verificáveis | RNFs | 🟡 RNF01 a RNF10 cobrem correção, manutenibilidade e usabilidade (RNF07, RNF09). Faltam desempenho e confiabilidade |
| 13 | Monorepo e custo de mudança | Repositório | ✅ #2 (monorepo npm) |
| 13 | Equipes por capacidade de negócio (Conway) | Responsáveis por módulo M1 a M4, revisão cruzada | ✅ requisitos §4 (dono ainda "a definir": #14) |
| 13 | DevEx: rodar com um comando, feedback rápido | Setup local | ✅ RNF05, #2 (`docker compose up`) |
| 13 | Versões de ferramenta controladas | Node 24 fixo para os quatro | 🟡 #2 (Node 24). Falta fixar (`engines` / `.nvmrc`) |
| 13 | Documentação operacional (runbook) | Demo: subir, reiniciar, resetar banco, rollback | ❌ |
| 13 | Governança com verificação automática | Regra de dependência entre camadas checada no lint | ❌ (cabe no #11) |

## Orientação por ticket aberto

### #14 Fluxo de Git e revisão do grupo (Aulas 3, 4 e 10)

A prática mais importante é a **branch de vida curta com PR pequeno**: um ticket de `/to-tickets` por branch, integrado à `main` em um ou dois dias. Esse é o trunk-based development da Aula 4, que não exclui PR nem review. Pontos que a aula sugere decidir:

- **Ship/Show/Ask.** O RNF04 hoje exige 1 aprovação em tudo ("Always Ask"). Para uma equipe nova de 4 pessoas, o artigo apoia usar mais Show e Ask. Uma opção é manter Ask obrigatório para código de produção e aceitar Show (merge com CI verde e review depois) para docs e configuração. Isso exigiria mudar o RNF04, e a decisão fica com o grupo.
- **Template de PR com o checklist de review** da Aula 4: correção, design, complexidade, testes, legibilidade, manutenibilidade, segurança, compatibilidade. Incluir também a **Definition of Done** da Aula 3 (testado, revisado, integrado, docs atualizadas, RN com teste).
- **Limite de WIP** no GitHub Projects (por exemplo, 1 ticket em andamento por pessoa) e a regra de **restaurar a `main` quebrada antes de qualquer outra coisa** (Aula 10).
- **Retrospectiva** curta ao fim de cada incremento (Aula 3), junto da release que a §9 já prevê.
- Mensagens de commit: manter o padrão atual (`tipo: descrição` em português) e explicar o porquê no corpo quando não for óbvio.

### #11 Definir a arquitetura do backend (Aulas 5, 6, 7 e 13)

A prática mais importante é o **Functional Core / Imperative Shell dentro de um monólito modular**:

- **Monólito modular** com M1 a M4 como módulos de fronteira explícita, sem microservices (Monolith First, Aula 6).
- **O core é puro.** Uma função como `decidirReserva(usuario, recurso, reservasExistentes, politica, agora)` devolve um **valor**, por exemplo `{ tipo: 'Recusada', violacoes: [{ rn: 'RN01', … }] }` ou `{ tipo: 'Criada', status: 'Pendente' | 'Confirmada' }`. Isso entrega direto a lista completa de regras violadas que o #8 decidiu.
- **Efeitos como dados (Aula 7).** Penalidade, Notificação e Cancelamento pelo sistema saem do core como efeitos, e o shell (Fastify + Prisma, numa transação) os executa. O `sincronizar(mundo, agora)` do #12 já segue esse modelo e serve de referência para os outros módulos.
- **Dependency Rule.** O core não importa Prisma, Fastify nem `Date.now()`. Dá para verificar isso no lint (por exemplo, regra de imports proibidos), seguindo a "governança automatizada" da Aula 13.
- **RN01 em dois lugares de propósito.** No core, para a mensagem. Na exclusion constraint, para garantir sob concorrência (defense in depth, Aula 12). Vale registrar que essa duplicação é intencional.
- **Login (Aula 12).** Sessão ou token emitido pelo backend. O `userId` sempre vem da sessão, nunca do corpo. Toda rota checa a autorização: RN13, dono da Reserva em RN14 e RN16, RN22. Registrar que o login sem senha é um risco aceito só para a demo.
- **Depois da decisão**, colocar as regras de design no `AGENTS.md` como "rules" para os agentes (Aula 5) e registrar a arquitetura num ADR (Aulas 8 e 13).

### #13 Estratégia de testes (Aulas 7, 8 e 9)

A prática mais importante é **TDD no core, testando comportamento e sem mocks**:

- **Classificar por I/O e não por "unit/integration" (Aula 9).** O que fica de cada lado:
  - **Sem I/O:** as funções puras do core, com um teste por exemplo de RN e o ID no nome (RNF01). É onde o TDD rende mais, e o `RelogioFixo` cobre o tempo.
  - **Com I/O:** Fastify `inject` + Postgres real (já decidido em #2). Cobre SQL, Prisma, exclusion constraint, transação e advisory lock do #12, e autorização por rota (RNF03).
  - **E2E:** os 3 fluxos do RNF03 no Playwright, e só eles.
- **Afirmar sobre o resultado, não sobre as chamadas.** O teste verifica Status, lista de violações e efeitos devolvidos, não que `repository.save` foi chamado. O core não precisa de mock. A integração usa banco real.
- **Tratar a pirâmide e os 80% como heurística (Aula 9).** O critério é feedback rápido e confiável no CI, em minutos (Aula 10).
- **Testes de segurança** (Aula 12): um Usuário não acessa nem altera a Reserva de outro, e outro Gestor não decide nem devolve (RN13).

### #15 Deploy contínuo para a demo (Aulas 10, 11 e 12)

A prática mais importante é **deploy pequeno e frequente da `main`, só com o CI verde, e com rollback conhecido**:

- **Continuous Deployment** da `main` para Render + Cloudflare Pages depois do CI verde. O ambiente é só produção, mais as prévias por PR do Pages se forem de graça. A Aula 10 lembra que mais ambientes não dão mais qualidade.
- **Rollback documentado.** A pesquisa do #9 registrou que o Render só volta aos 2 deploys anteriores. Ter também o `git revert` como caminho.
- **Migrações do Prisma** compatíveis com a versão anterior (expand → migrate → contract), para o rollback do código não quebrar no banco do Neon.
- **Segredos** (Aula 12) no painel do Render e nos secrets do GitHub, nunca no repositório. A `DATABASE_URL` não aparece em log.
- **Métricas DORA** (Aula 10), medidas a partir do GitHub: frequência de deploy, lead time do PR ao deploy, taxa de falha e tempo de recuperação. Ver lacunas.

## Lacunas

Práticas das aulas que nem o `docs/requisitos.md` nem um ticket aberto cobrem, com uma sugestão concreta para cada:

1. **Observabilidade (Aula 11).** Nada no projeto diz como saber, na demo, que o sistema está funcionando.
   - **Sugestão:** logs estruturados em JSON (o logger padrão do Fastify é o Pino, que já gera JSON) com eventos de domínio: `reserva_criada`, `regra_violada{rn}`, `pedido_expirado`, `penalidade_gerada`, `sincronizar_aplicou{n}`.
   - Uma rota `GET /saude` que checa o banco, para o health check do Render.
   - Um pequeno painel de métricas de negócio para o Gestor: Não comparecimentos, Pedidos expirados, regras mais violadas. Isso também atende ao "gestores sem visão do uso" da §1, que nenhuma história cobre hoje.
   - Grafana e OpenTelemetry ficam de fora (YAGNI).
   - **Onde decidir:** #11 (logs no shell) e #15 (health check).
2. **Segurança automatizada e autorização explícita (Aula 12).**
   - **Sugestão:** Dependabot e `npm audit --audit-level=high` no CI. Proteção contra segredos commitados (secret scanning do GitHub, se disponível para o repositório).
   - Deixar explícito na RN16/US13 que **só o dono** cancela a própria Reserva.
   - Rodar o checklist da seção 5 da aula antes da demo.
   - **Onde decidir:** #14 (CI), #11 (autorização) e uma linha no `docs/requisitos.md`.
3. **RNFs verificáveis de desempenho e confiabilidade (Aulas 8 e 12).** Os RNFs atuais não têm números.
   - **Sugestão:** um RNF de latência, por exemplo "busca e agenda respondem em menos de 500 ms no p95 com o servidor acordado". Contar à parte o cold start de cerca de 1 min do Render (#9).
   - Um RNF de confiabilidade: "duas requisições simultâneas para o mesmo Intervalo: exatamente uma vira Reserva", testado na integração.
   - Reescrever o RNF07 com critério observável (por exemplo, "os 3 fluxos do RNF03 passam no Playwright com viewport de celular").
4. **Métricas DORA (Aula 10).** A disciplina cobra o conceito, mas ninguém vai medi-las.
   - **Sugestão:** um script ou workflow que lê os PRs e os deploys do GitHub Actions e calcula frequência de deploy, lead time do PR ao deploy, taxa de falha (reverts e hotfixes) e tempo de recuperação. Mostrar os números na apresentação.
   - **Onde decidir:** #15.
5. **Documentação de decisões e de operação (Aulas 8 e 13).** As decisões estão só nos comentários das issues, e `docs/adr/` não existe.
   - **Sugestão:** ADRs curtos para stack (#2), regras de tempo (#12), arquitetura (#11) e deploy (#15). A skill `/domain-modeling` cria esses arquivos sob demanda.
   - Um **roteiro de operação da demo**: como subir, acordar o Render antes da apresentação, resetar o banco de demonstração, fazer rollback e usar o `POST /demo/relogio`. Esse roteiro encaixa no item "Dados de demonstração e roteiro da apresentação" que o mapa já tem em "Not yet specified".
6. **Processo da equipe além do Git (Aula 3).** Definition of Done, limite de WIP e retrospectiva por incremento não estão na pergunta do #14.
   - **Sugestão:** incluir os três na sessão do #14 (ver orientação acima).
7. **Feedback de usuários e outcome (Aula 2).** O projeto mede output (histórias entregues), mas não testa com usuários.
   - **Sugestão:** a cada incremento, 2 ou 3 colegas de fora do grupo tentam reservar sem ajuda e o grupo anota onde travaram (Measure → Learn). Pode virar slide da apresentação.
8. **Regras de design para os agentes (Aula 5).** O `AGENTS.md` só aponta o issue tracker e os docs de domínio.
   - **Sugestão:** depois do #11, acrescentar uma seção curta de princípios: regras de negócio puras no core, nomes do `CONTEXT.md`, sem abstração especulativa, rodar os testes depois de refatorar.

## Incertezas

- O notebook da Aula 03 tem uma segunda fonte ("A product brief for tech companies…") que não foi lida inteira. Pelo resumo do notebook, ela trata de documentos de alinhamento e métricas de sucesso, o que reforça a lacuna 7.
- A disponibilidade do secret scanning e da push protection do GitHub depende da visibilidade do repositório e do plano. Confirmar nas configurações antes de contar com isso.
- O health check e o gatilho de deploy do Render não foram reconfirmados nesta pesquisa. A fonte é a pesquisa do #9. Conferir na documentação do Render ao resolver o #15.
