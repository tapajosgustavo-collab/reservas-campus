# TypeScript ponta a ponta num monorepo, com PostgreSQL

A API e a tela são escritas em **TypeScript** (`strict`, Node 24) num monorepo de **npm workspaces**: `apps/api` (Fastify + Zod), `apps/web` (React + Vite + Mantine) e `packages/shared`, com os schemas Zod de cada rota, que são o contrato entre as duas. O banco é o **PostgreSQL 16**, acessado pelo Prisma, e os testes usam Vitest e Playwright. Escolhemos uma linguagem só porque cada integrante pega histórias de ponta a ponta (banco, API e tela) em cerca de 5 semanas, e duas linguagens trariam dois lints e dois jeitos de testar. O grupo já usava JavaScript/TypeScript e React. Decidido no ticket [Escolher a stack do projeto (em grupo)](https://github.com/tapajosgustavo-collab/reservas-campus/issues/2).

## Consequências

- **O Zod é a única fonte do formato.** O mesmo schema do `shared` valida a rota (`fastify-type-provider-zod`), gera o OpenAPI em `/api/docs` (`@fastify/swagger`, RNF06) e tipa a tela. Rota nova começa pelo schema no `shared`; não escreva tipo de resposta à mão nem gere cliente.
- **Fastify fica só na borda.** As regras ficam em TypeScript puro no `nucleo/` (ADR 0001), então o framework é trocável e não aparece nos testes de RN. Os logs estruturados vêm do Pino, que já vem com o Fastify.
- **O Conflito também é barrado no banco.** A exclusion constraint `reserva_sem_conflito` (`btree_gist`, `tstzrange` com `[)`) impede duas Reservas ativas que se sobrepõem, mesmo com pedidos simultâneos. O Prisma não modela isso, então ela fica escrita à mão na primeira migração. É o principal motivo de não usar SQLite.
- **Datas com date-fns v4 + `@date-fns/tz`**, fuso `America/Sao_Paulo` (RNF08), colunas `timestamptz`. A API devolve instantes em ISO com o deslocamento de São Paulo.
- **Testes de integração no Postgres real**, com `app.inject()` do Fastify e um banco por worker, sem mock de banco. O banco de teste é outro banco no mesmo container do compose.
- **Rodar local:** `docker compose up -d db` + `npm run dev` no dia a dia (o Vite repassa `/api` para a API, sem CORS); `docker compose up` para a demo, com a mesma imagem do deploy (ADR 0005). Node fixado no `.nvmrc`.

## Opções consideradas

- **Python (FastAPI, Django) no backend:** o grupo conhece, mas seriam duas linguagens e os schemas não seriam compartilhados com a tela.
- **NestJS:** mais cerimônia (decorators, módulos de DI) sem ganho para o tamanho do projeto. **Express:** validação e OpenAPI escritos à mão.
- **Next.js:** o sistema é um painel logado, o SSR não ajuda, e a API separada é o que a RNF03 e a RNF06 pedem para testar e documentar.
- **SQLite:** sem exclusion constraint e com datas e fuso piores. **Drizzle** no lugar do Prisma, **MUI/Tailwind** no lugar do Mantine, **Cypress** no lugar do Playwright, **Luxon/Day.js** no lugar do date-fns e **dois repositórios**: descartados no mesmo ticket.
