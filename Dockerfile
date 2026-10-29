# Imagem única (spec §1 e §7): a API serve o build da tela na mesma origem.
# A mesma imagem roda no `docker compose up`, no job e2e do CI e no Render.

FROM node:24-slim AS base
# O Prisma CLI (migrate deploy) precisa do OpenSSL; os certificados, para o TLS do Neon.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Só os manifestos de todos os workspaces, para o `npm ci` ficar em cache enquanto eles não mudam.
# O postinstall da API roda o `prisma generate`, que lê o schema e o prisma.config.ts.
FROM base AS manifestos
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY ferramentas/quadro/package.json ferramentas/quadro/
COPY e2e/package.json e2e/

FROM manifestos AS tela
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @reservas/web

FROM manifestos AS final
ENV NODE_ENV=production
RUN npm ci --omit=dev && npm cache clean --force
COPY packages/shared packages/shared
COPY apps/api/src apps/api/src
COPY --from=tela /app/apps/web/dist apps/web/dist
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh

ENV HOST=0.0.0.0 \
  PORT=3000 \
  PASTA_DA_TELA=/app/apps/web/dist
EXPOSE 3000
USER node

HEALTHCHECK --interval=5s --timeout=3s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# Por último, para trocar o SHA não invalidar as camadas de cima. No Render vem o RENDER_GIT_COMMIT.
ARG GIT_SHA=
ENV GIT_SHA=$GIT_SHA

ENTRYPOINT ["entrypoint.sh"]
