#!/bin/sh
# Entrypoint da imagem (spec §7): migrações, seed só com o banco vazio e o servidor.
# Com `set -e`, uma migração que falha para o contêiner aqui, e a versão anterior continua no ar.
set -e
cd /app/apps/api

npm run db:aplicar
# O próprio seed confere se o banco está vazio (RNF10) e, se não estiver, não toca em nada.
npm run db:semear

# `exec` deixa o Node como processo principal, para ele receber o SIGTERM e fechar direito.
exec node --import tsx src/servidor.ts
