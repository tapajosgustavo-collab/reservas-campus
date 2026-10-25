# Pesquisa: opções gratuitas de hospedagem para a demo

> Ticket: [#9](https://github.com/tapajosgustavo-collab/reservas-campus/issues/9) · Mapa: [#1](https://github.com/tapajosgustavo-collab/reservas-campus/issues/1)
> Fontes consultadas em **2026-10-25**, sempre na documentação ou página de preços oficial de cada plataforma. Planos gratuitos mudam com frequência: **reconfirmar os limites na semana anterior à demo** (início de dezembro de 2026).

## Pergunta

Quais plataformas permitem hospedar de graça, em 2026, um backend web, um frontend e um banco PostgreSQL para a demo de um projeto acadêmico, com deploy automático a partir do GitHub? Para cada opção: limites do plano gratuito (hibernação, horas/mês, tamanho do banco, expiração do banco), se exige cartão de crédito e se o deploy pode ser disparado pelo GitHub Actions.

A stack ainda não foi escolhida (provavelmente backend Node/TypeScript ou Python, frontend React, Postgres), então só entraram plataformas que aceitam as duas linguagens de backend ou que são neutras quanto à stack.

## Resposta curta

- **Frontend (React estático):** Cloudflare Pages ou Vercel Hobby. Os dois são gratuitos, sem hibernação e com deploy automático a cada push.
- **Backend:** Render, no tipo de instância Free. Roda Node ou Python como serviço web comum, tem 750 h/mês, mas **hiberna após 15 min sem tráfego e leva cerca de 1 min para acordar**.
- **Banco:** Neon Free, com 1 GB por projeto, **sem expiração** e sem cartão. **Não** usar o Postgres gratuito do Render, que **expira 30 dias após a criação**.
- Alternativa com menos peças: Vercel para frontend **e** API (funções Node ou Python) + Neon.

## Tabela comparativa

Legenda da coluna "Actions": **sim** quer dizer que a fonte oficial documenta deploy disparado de um workflow do GitHub Actions (CLI, token ou deploy hook). Todas as plataformas abaixo também fazem deploy automático por integração direta com o GitHub (push → deploy), menos onde está indicado.

### Backend (e plataformas "tudo em um")

| Plataforma | O que é grátis | Hibernação / horas | Postgres incluso | Cartão? | Actions | Observações |
|---|---|---|---|---|---|---|
| **Render** (Free) | Serviços web, estáticos e Postgres na instância Free | Serviço web hiberna após **15 min** sem tráfego; acordar leva **~1 min**. **750 h/mês** por workspace; se acabarem, os serviços ficam suspensos até o mês seguinte | **1 GB**, 1 banco por workspace, **expira 30 dias após a criação** (+14 dias de carência para fazer upgrade, depois é apagado) | Docs: "No payment is required". Há relatos no fórum de pedido de cartão para verificação antifraude (incerto, ver abaixo) | **sim**, por deploy hook (URL secreta chamada com `curl`; a doc traz um exemplo de workflow) | Sistema de arquivos efêmero; rollback só para os 2 deploys anteriores |
| **Railway** | Trial: **US$ 5 únicos por 30 dias**. Depois, plano Free: **US$ 1/mês** de crédito | Trial: até 2 vCPU / 1 GB por serviço. Free: até 1 vCPU / 0,5 GB por serviço, 1 réplica | Postgres pode ser criado, mas é cobrado do crédito. Volume de **0,5 GB** no Free | Trial: "No credit card required". O trial completo depende de verificação da conta GitHub; sem ela vira "Limited Trial", com rede restrita | sim (CLI `railway up` com token) | US$ 1/mês não sustenta backend + banco ligados o mês inteiro. Volumes de contas trial são apagados 30 dias após o fim dos créditos |
| **Fly.io** | **Sem plano gratuito** para organizações novas. Trial de **2 h de máquina ou 7 dias**, o que vier primeiro | n/a | Managed Postgres a partir de **US$ 38/mês** | Cartão obrigatório depois do trial | sim (`flyctl deploy`) | **Descartado** |
| **Koyeb** (Starter) | 1 serviço web Free (512 MB RAM, 0,1 vCPU, 2 GB SSD) + 1 Postgres Free | Serviço web vai a zero após **1 h** sem tráfego. Só nas regiões Frankfurt ou Washington D.C. | **1 GB** e só **5 h de computação ativa/mês**; dorme após 5 min | **Sim**: o FAQ diz que exige cartão "to prevent fraud and abuse" | sim (CLI / GitHub Action própria) | 5 h/mês de banco é pouco para desenvolver e apresentar |
| **Vercel** (Hobby) | Frontend + funções serverless (Node, Bun, Python ASGI/WSGI como FastAPI/Flask/Django, Go, contêiner) | Sem "hibernação" de serviço, mas funções sem uso são **arquivadas em até 2 semanas** (a primeira chamada depois disso fica ≥1 s mais lenta). 4 CPU-h ativas, 1 milhão de invocações/mês, duração máxima de 300 s | Não tem Postgres próprio no Hobby; usar Neon via Marketplace ou conexão direta | Não (o cartão só aparece no upgrade para Pro) | **sim** (`vercel pull` / `vercel build` / `vercel deploy --prebuilt` com `VERCEL_TOKEN`) | Hobby é "non-commercial, personal use only" (projeto acadêmico se encaixa). Sem colaboração em equipe no Hobby: o projeto fica na conta de um aluno. 100 deploys/dia. Sem framework, cada arquivo em `api/` vira uma função (máx. 12 por deploy) |
| **Netlify** (Free) | Frontend + funções | **300 créditos/mês, limite rígido**: cada deploy de produção custa **15 créditos** (≈ 20 deploys/mês), 1 GB de banda = 20 créditos | Netlify DB é cobrado em créditos | Não informado na doc | sim (Netlify CLI) | Quando os créditos acabam, **todos os sites são pausados** ("Site not available"). Com deploy automático a cada push, o crédito acaba rápido. Deploy previews não consomem crédito |
| **Cloudflare Workers** (Free) | 100 mil requisições/dia, **10 ms de CPU por invocação** | Sem hibernação | D1 (SQLite, 5 GB, **não é Postgres**). Hyperdrive conecta a um Postgres externo (100 mil consultas/dia) | Não | sim (`wrangler deploy`) | Não roda um servidor Express/FastAPI comum sem adaptação. Bom só se o backend for escrito para Workers |
| **Azure for Students** | **US$ 100 de crédito por 12 meses**, renovável enquanto for estudante | App Service gratuito: até 10 apps, 1 GB, **"1 hour per day"** de computação | PostgreSQL Flexible Server B1MS: **750 h/mês, 32 GB**, por 12 meses | **Não** ("No credit card required"); exige e-mail institucional de aluno em tempo integral | sim (GitHub Actions oficiais da Azure) | Mais generoso no banco, mas a configuração é mais trabalhosa e o recurso fica na assinatura de um aluno |
| **AWS** (Free plan, contas novas) | US$ 100 de crédito (+ até US$ 100 explorando serviços) | Conta **encerra sozinha em 6 meses** ou quando o crédito acaba | RDS entra no crédito | A página não diz; historicamente exige cartão (incerto) | sim | Complexo demais para a demo |
| **Google Cloud** | Cloud Run Free Tier (2 milhões de req/mês) + trial de US$ 300 por 90 dias | Cloud Run escala a zero | Cloud SQL **não** está no Free Tier (só trial de 30 dias) | **Sim**: exige conta de faturamento e cartão | sim | Descartado por exigir cartão |
| **Heroku** (GitHub Student Pack) | US$ 13/mês por 24 meses (Eco dyno US$ 5 + Postgres Mini US$ 5 cabem) | Eco dyno dorme sem tráfego | Postgres Mini incluso no crédito | **Sim**: "you will need a valid credit or debit card on file" | sim | Viável só para quem tem cartão |

### Banco PostgreSQL dedicado

| Plataforma | Tamanho | Computação / hibernação | Expiração | Cartão? | Actions |
|---|---|---|---|---|---|
| **Neon** (Free) | **1 GB por projeto**, 20 GB no total; até 100 projetos | **100 CU-h/mês por projeto** (≈ 400 h a 0,25 CU). Suspende após **5 min** ocioso (não dá para desligar isso); a primeira consulta acorda o banco | **Nenhuma**: plano "permanent (not a trial)"; estourar limites suspende a computação ou bloqueia escrita, mas "None of these limits delete your data" | **Não** | sim (Actions oficiais para criar/apagar branch de banco; disponibilidade no Free não está explícita) |
| **Supabase** (Free) | **500 MB por projeto**, 2 projetos ativos, 5 GB de egress | Sempre ligado, mas **o projeto é pausado após 7 dias de baixa atividade** (aviso por e-mail cerca de 1 semana antes). Retomar é manual, pelo dashboard, em até 1 ano | Não expira; pausado pode ser restaurado em até 1 ano | Não mencionado na página de preços | sim (Supabase CLI para migrações) |
| **Render Postgres** (Free) | 1 GB, 1 por workspace | Não documentado | **Expira 30 dias após a criação** (+14 dias de carência) | ver Render | n/a |
| **Koyeb Postgres** (Free) | 1 GB | **5 h ativas/mês**, dorme após 5 min | Não informado | Sim | n/a |
| **Azure PostgreSQL** (Students) | 32 GB | 750 h/mês de B1MS (dá para deixar ligado o mês todo) | 12 meses | Não | sim |

### Frontend estático (React)

| Plataforma | Limites do plano gratuito | Cartão? | Actions | Observações |
|---|---|---|---|---|
| **Cloudflare Pages** | 500 builds/mês, 1 build por vez, timeout de 20 min, 20 mil arquivos, 25 MiB por arquivo | Não | sim (`wrangler pages deploy`) | Sem hibernação; boa opção para SPA |
| **Vercel** (Hobby) | 100 GB de transferência, 100 deploys/dia | Não | sim | Ver restrições do Hobby acima |
| **Netlify** (Free) | 300 créditos/mês (15 por deploy de produção) | Não informado | sim | Risco de pausar todos os sites ao estourar |
| **GitHub Pages** | Site ≤ 1 GB, banda "soft" de 100 GB/mês, deploy via Actions | Não | sim (nativo) | Só serve arquivos estáticos. **Nosso repositório é privado**: no GitHub Free, Pages só funciona em repositório público. O GitHub Pro (incluso no Student Pack) libera Pages em repositório privado, mas isso não foi verificado na prática |
| **Render Static Site** | Gratuito, sem hibernação | ver Render | sim (deploy hook) | Conta como mais um serviço no mesmo workspace |

## Recomendação para a demo (4 alunos)

**Combinação principal: Cloudflare Pages (frontend) + Render Free (backend) + Neon Free (Postgres).**

- Nenhuma das três exige cartão segundo a documentação oficial, e o banco do Neon **não expira**. Isso evita o maior risco do Render, cujo Postgres gratuito morre 30 dias após a criação.
- O Render roda um processo comum (Express/Nest/Fastify ou FastAPI/Django), então a escolha da stack não depende da hospedagem.
- Deploy automático: as três têm integração direta com o GitHub (push na `main` → deploy). Se o time quiser rodar os testes antes do deploy, o workflow do Actions termina chamando o **deploy hook do Render** e o `wrangler pages deploy`.
- 750 h/mês cobrem **um** serviço web ligado o mês inteiro (~744 h). Para não estourar, o time deve ter **um único** serviço Free em execução no workspace.
- Contas: criar as contas numa organização/e-mail do grupo, ou numa conta de um aluno com os outros como colaboradores, e guardar as credenciais num gerenciador compartilhado, para não depender de uma pessoa no dia.

**Alternativa com menos peças: Vercel Hobby (frontend + API como funções Node ou Python) + Neon.** Não tem a hibernação de 1 minuto do Render, mas obriga a escrever o backend no modelo serverless: sem processo contínuo, sem WebSocket persistente, sem tarefas em segundo plano, limite de 300 s por requisição. O Hobby também não tem colaboração em equipe; o projeto fica na conta de um aluno.

**Plano B se algo mudar:** Azure for Students (App Service + PostgreSQL B1MS, sem cartão, crédito de US$ 100). É mais trabalhoso de configurar, mas tem o banco mais folgado (32 GB, 750 h).

**Descartados:** Fly.io (sem plano gratuito), Google Cloud, Heroku e Koyeb (exigem cartão), Railway (US$ 1/mês não sustenta backend + banco depois do trial de 30 dias), Netlify como host principal (o limite de créditos pausa tudo; ≈ 20 deploys de produção por mês).

## Riscos principais e mitigação

1. **Cold start do backend no Render (~1 min).** Na primeira requisição depois de 15 min parado, a página fica "carregando" por cerca de um minuto, o que é ruim na frente da banca. *Mitigação:* abrir a aplicação 2–3 min antes da apresentação (ou chamar um endpoint `/health`). Opcionalmente, um workflow agendado do Actions pode fazer *ping* só na janela da demo. Não vale a pena deixar *ping* 24/7: isso gasta as 750 h e não é necessário.
2. **Banco expirando antes da apresentação.** O Postgres Free do Render expira em 30 dias: um banco criado em 1º de novembro morre por volta de 1º de dezembro. *Mitigação:* usar Neon. Se usarem Supabase, lembrar que ele **pausa após 7 dias sem atividade** e precisa ser retomado manualmente; verificar se está ativo no dia anterior.
3. **Primeira consulta lenta no Neon.** O banco suspende após 5 min ocioso; a primeira consulta acorda a computação, com atraso pequeno. Somado ao cold start do Render, o "aquecimento" antes da demo resolve os dois.
4. **Mudança de plano até dezembro.** Free tiers mudaram muito em 2024–2026 (o Fly.io acabou com o gratuito, o Railway e o Netlify passaram a usar créditos). *Mitigação:* reconfirmar os limites na semana da demo e ter o plano B (Azure for Students) testado.
5. **Pedido de cartão no cadastro do Render.** A doc oficial diz que não precisa de pagamento, mas há relatos no fórum da comunidade de pedido de cartão para verificação antifraude (cobrança temporária de US$ 1, depois estornada). *Mitigação:* criar a conta cedo para descobrir; se for exigido, usar o Vercel para a API ou o Azure for Students.
6. **Dados de demo.** Ter um script de *seed* versionado para recriar o banco em qualquer provedor em poucos minutos. Isso reduz o custo de trocar de plataforma.

## Pontos incertos

- **Render e cartão:** a documentação oficial diz que não é preciso pagar, mas o fórum tem relatos de pedido de cartão para verificação. Não confirmado para contas novas em 2026.
- **Netlify e cartão:** a documentação de créditos não diz se o plano Free exige cartão.
- **Supabase e cartão:** a página de preços não menciona cartão para o Free.
- **AWS e cartão:** a página atual do Free plan não diz se exige cartão.
- **GitHub Pages em repositório privado:** a doc de planos diz que o GitHub Free só tem Pages em repositório público. Não verifiquei se o GitHub Pro do Student Pack resolve no nosso caso.
- **Neon:** a doc das GitHub Actions de branch não diz se elas estão disponíveis no plano Free.
- **Restauração no Supabase:** a doc atual diz 1 ano, mas um changelog de 2024 dizia 90 dias. Vale a doc atual.

## Fontes (consultadas em 2026-10-25)

- Render, instâncias Free: https://render.com/docs/free
- Render, deploy hooks (com exemplo de GitHub Actions): https://render.com/docs/deploy-hooks
- Render, primeiro deploy ("No payment is required"): https://render.com/docs/your-first-deploy
- Render, fórum sobre pedido de cartão (fonte secundária, relatos de usuários): https://community.render.com/t/free-but-credit-card-first/24630
- Railway, trial: https://docs.railway.com/reference/pricing/free-trial
- Railway, planos: https://docs.railway.com/reference/pricing/plans e https://railway.com/pricing
- Fly.io, preços: https://docs.fly.io/about/pricing
- Koyeb, instâncias: https://www.koyeb.com/docs/reference/instances
- Koyeb, bancos: https://www.koyeb.com/docs/databases
- Koyeb, FAQ de preços (cartão): https://www.koyeb.com/docs/faqs/pricing
- Vercel, plano Hobby: https://vercel.com/docs/plans/hobby
- Vercel, runtimes: https://vercel.com/docs/functions/runtimes
- Vercel, GitHub Actions: https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel
- Netlify, planos com créditos: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/
- Netlify, como funcionam os créditos: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/
- Cloudflare Workers, preços: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Pages, limites: https://developers.cloudflare.com/pages/platform/limits/
- Neon, preços: https://neon.com/pricing
- Neon, planos: https://neon.com/docs/introduction/plans
- Neon, GitHub Actions: https://neon.com/docs/guides/branching-github-actions
- Supabase, preços: https://supabase.com/pricing
- Supabase, pausa de projetos Free: https://supabase.com/docs/guides/platform/free-project-pausing
- GitHub Pages, limites: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- GitHub, planos: https://docs.github.com/en/get-started/learning-about-github/githubs-plans
- GitHub Student Developer Pack: https://education.github.com/pack
- Azure for Students: https://azure.microsoft.com/en-us/free/students
- AWS Free Tier: https://aws.amazon.com/free/
- Google Cloud, recursos gratuitos: https://docs.cloud.google.com/free/docs/free-cloud-features
- Heroku para GitHub Students: https://www.heroku.com/github-students/
