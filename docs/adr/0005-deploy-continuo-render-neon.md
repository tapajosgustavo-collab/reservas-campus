# Deploy contínuo de uma imagem só no Render, com banco no Neon

A cada merge na `main`, o `deploy.yml` roda o CI, chama o deploy hook de **um** serviço Web no **Render Free** e espera o `GET /api/health` responder com o SHA do commit novo; o resultado vira um GitHub Deployment no ambiente `producao`. O serviço roda a mesma imagem Docker do `docker compose up`, em que a API serve o build da tela (`@fastify/static`) na mesma origem, e o banco fica no **Neon Free**, os dois em `us-east-1`. A demo principal continua local; produção é o plano B da apresentação e a prova de que o grupo integra e entrega mudanças (Aula 10). Escolhemos Render + Neon por serem gratuitos sem cartão e o Neon não expirar, e uma origem só porque com duas o cookie de sessão viraria cookie entre sites. Decidido nos tickets [Deploy contínuo para a demo](https://github.com/tapajosgustavo-collab/reservas-campus/issues/15) e [Opções gratuitas de hospedagem para a demo](https://github.com/tapajosgustavo-collab/reservas-campus/issues/9).

## Consequências

- **Só o workflow publica.** O auto-deploy do Render fica desligado, para todo deploy passar pelo CI e ficar registrado no GitHub. Os Deployments de `producao` são a fonte das métricas DORA (`npm run dora`, `dora.yml`). Cada execução gera **dois** Deployments na aba Environments: o automático do GitHub (o job declara `environment: producao`) e o do passo "Criar GitHub Deployment"; o `npm run dora` conta só o segundo (`description = "Deploy contínuo no Render"`).
- **Migrações no entrypoint do container**, não num passo do Actions: `prisma migrate deploy`, seed e servidor (`docker/entrypoint.sh`). Se a migração falha, o container não sobe, o health check reprova e a versão anterior continua no ar. Por isso **só migrações aditivas**: a versão anterior ainda responde durante a troca.
- **Seed só com o banco vazio.** O entrypoint roda a cada cold start (o Render dorme depois de 15 min), então o seed nunca apaga dados. Para recomeçar, o workflow manual `resetar-banco.yml` esvazia as tabelas e recarrega o seed.
- **Segredos:** as URLs do Neon (com pooler para a aplicação, direta para as migrações) e o segredo de sessão ficam no Render. No GitHub, só no ambiente `producao` (que só a `main` acessa): a URL do deploy hook e a **URL direta do Neon** (`DATABASE_URL`), esta só para o workflow manual `resetar-banco.yml`. **Mudança em relação ao #15**, que deixava a URL do banco só no Render: o reset precisa rodar pelo Actions, e o Render Free não tem shell nem job avulso. As contas do Render e do Neon ficam num e-mail do grupo.
- **Produção usa o relógio real, sem `DEMO=1`.** Exposta na internet, a rota do relógio deixaria qualquer pessoa com o link avançar o tempo de todos. A viagem no tempo fica na demo local (ADR 0004).
- **Deploy quebrado se resolve por PR.** Health reprovado mantém a versão anterior; funcionalidade quebrada se resolve com `git revert` do merge num PR com a label `incidente`, que o deploy contínuo publica. Rollback pelo painel do Render só em emergência no dia da apresentação.
- **Cold start de cerca de 1 min.** No dia da apresentação, abrir produção uns 3 min antes; sem ping agendado. Reconfirmar os limites dos planos gratuitos na semana anterior.

## Opções consideradas

- **Tela no Cloudflare Pages e API no Render** (a recomendação da pesquisa de hospedagem): duas origens, com CORS e cookie entre sites, que os navegadores bloqueiam.
- **Postgres do Render:** o plano gratuito expira 30 dias depois de criado, antes ou durante a apresentação. **Supabase:** pausa depois de 7 dias de pouco uso.
- **Vercel:** backend serverless.
- **Auto-deploy do Render:** o deploy não ficaria registrado no GitHub. **Migrações e reset só no Render:** sem shell no plano gratuito, o reset teria que ser uma rota da API, que ficaria exposta na internet.
- **Prévia por PR:** exigiria um branch do Neon por PR e mais segredos; quem revisa roda o branch local.
