-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "perfil" AS ENUM ('Aluno', 'Docente', 'Gestor');

-- CreateEnum
CREATE TYPE "motivo_penalidade" AS ENUM ('NaoComparecimento', 'CancelamentoTardio', 'DevolucaoAtrasada');

-- CreateEnum
CREATE TYPE "tipo_recurso" AS ENUM ('Espaco', 'Equipamento');

-- CreateEnum
CREATE TYPE "status" AS ENUM ('Pendente', 'Confirmada', 'Recusada', 'Expirada', 'Cancelada', 'EmUso', 'Concluida', 'NaoComparecimento');

-- CreateEnum
CREATE TYPE "tipo_notificacao" AS ENUM ('Aprovacao', 'Recusa', 'Expiracao', 'CancelamentoPeloSistema', 'Penalidade', 'DevolucaoAtrasada', 'InicioSuspensao', 'FimSuspensao', 'Lembrete');

-- CreateTable
CREATE TABLE "usuario" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "perfil" "perfil" NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "penalidade" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "reserva_id" INTEGER NOT NULL,
    "motivo" "motivo_penalidade" NOT NULL,
    "em" TIMESTAMPTZ NOT NULL,
    "suspensao_id" INTEGER,

    CONSTRAINT "penalidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suspensao" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "inicio" TIMESTAMPTZ NOT NULL,
    "fim" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "suspensao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurso" (
    "id" SERIAL NOT NULL,
    "tipo" "tipo_recurso" NOT NULL,
    "nome" TEXT NOT NULL,
    "local" TEXT,
    "capacidade" INTEGER,
    "patrimonio" TEXT,
    "gestor_id" INTEGER NOT NULL,

    CONSTRAINT "recurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horario_funcionamento" (
    "recurso_id" INTEGER NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "abre" INTEGER NOT NULL,
    "fecha" INTEGER NOT NULL,

    CONSTRAINT "horario_funcionamento_pkey" PRIMARY KEY ("recurso_id","dia_semana")
);

-- CreateTable
CREATE TABLE "indisponibilidade" (
    "id" SERIAL NOT NULL,
    "recurso_id" INTEGER NOT NULL,
    "inicio" TIMESTAMPTZ NOT NULL,
    "fim" TIMESTAMPTZ,
    "motivo" TEXT NOT NULL,
    "criada_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "indisponibilidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "serie" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "recurso_id" INTEGER NOT NULL,
    "criada_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "serie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserva" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "recurso_id" INTEGER NOT NULL,
    "serie_id" INTEGER,
    "inicio" TIMESTAMPTZ NOT NULL,
    "fim" TIMESTAMPTZ NOT NULL,
    "participantes" INTEGER,
    "finalidade" VARCHAR(200),
    "status" "status" NOT NULL,
    "criada_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transicao" (
    "id" SERIAL NOT NULL,
    "reserva_id" INTEGER NOT NULL,
    "de" "status",
    "para" "status" NOT NULL,
    "em" TIMESTAMPTZ NOT NULL,
    "por_id" INTEGER,
    "observacao" TEXT,

    CONSTRAINT "transicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacao" (
    "id" SERIAL NOT NULL,
    "destinatario_id" INTEGER NOT NULL,
    "tipo" "tipo_notificacao" NOT NULL,
    "mensagem" TEXT NOT NULL,
    "em" TIMESTAMPTZ NOT NULL,
    "lida_em" TIMESTAMPTZ,
    "reserva_id" INTEGER,
    "suspensao_id" INTEGER,

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "penalidade_reserva_id_key" ON "penalidade"("reserva_id");

-- CreateIndex
CREATE UNIQUE INDEX "recurso_patrimonio_key" ON "recurso"("patrimonio");

-- CreateIndex
CREATE INDEX "reserva_recurso_id_inicio_idx" ON "reserva"("recurso_id", "inicio");

-- CreateIndex
CREATE INDEX "reserva_status_inicio_idx" ON "reserva"("status", "inicio");

-- CreateIndex
CREATE INDEX "transicao_reserva_id_em_idx" ON "transicao"("reserva_id", "em");

-- CreateIndex
CREATE INDEX "notificacao_destinatario_id_lida_em_idx" ON "notificacao"("destinatario_id", "lida_em");

-- AddForeignKey
ALTER TABLE "penalidade" ADD CONSTRAINT "penalidade_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalidade" ADD CONSTRAINT "penalidade_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalidade" ADD CONSTRAINT "penalidade_suspensao_id_fkey" FOREIGN KEY ("suspensao_id") REFERENCES "suspensao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suspensao" ADD CONSTRAINT "suspensao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurso" ADD CONSTRAINT "recurso_gestor_id_fkey" FOREIGN KEY ("gestor_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horario_funcionamento" ADD CONSTRAINT "horario_funcionamento_recurso_id_fkey" FOREIGN KEY ("recurso_id") REFERENCES "recurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indisponibilidade" ADD CONSTRAINT "indisponibilidade_recurso_id_fkey" FOREIGN KEY ("recurso_id") REFERENCES "recurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serie" ADD CONSTRAINT "serie_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serie" ADD CONSTRAINT "serie_recurso_id_fkey" FOREIGN KEY ("recurso_id") REFERENCES "recurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_recurso_id_fkey" FOREIGN KEY ("recurso_id") REFERENCES "recurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_serie_id_fkey" FOREIGN KEY ("serie_id") REFERENCES "serie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transicao" ADD CONSTRAINT "transicao_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transicao" ADD CONSTRAINT "transicao_por_id_fkey" FOREIGN KEY ("por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_destinatario_id_fkey" FOREIGN KEY ("destinatario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_suspensao_id_fkey" FOREIGN KEY ("suspensao_id") REFERENCES "suspensao"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Escrito à mão (o Prisma não modela isto; Modelo de dados, #16) ──────────────
-- Os CHECKs são segunda proteção: as regras continuam no núcleo, com a RN citada (ADR 0001).

-- Igualdade de inteiro dentro de um índice GiST, para a exclusion constraint abaixo.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- RN01 no banco: Reservas ativas do mesmo Recurso não se sobrepõem. Intervalos que só se encostam
-- (10h–12h e 12h–14h) passam, por causa do '[)'. A violação vira 409 conflito_concorrente.
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_sem_conflito"
  EXCLUDE USING gist ("recurso_id" WITH =, tstzrange("inicio", "fim", '[)') WITH &&)
  WHERE ("status" IN ('Pendente', 'Confirmada', 'EmUso'));

ALTER TABLE "reserva" ADD CONSTRAINT "reserva_fim_depois_do_inicio" CHECK ("fim" > "inicio");

-- O "IS NOT NULL" explícito importa: com capacidade nula, "capacidade > 0" dá NULL, e um CHECK
-- que dá NULL deixa a linha passar.
ALTER TABLE "recurso" ADD CONSTRAINT "recurso_campos_por_tipo" CHECK (
  ("tipo" = 'Espaco' AND "capacidade" IS NOT NULL AND "capacidade" > 0 AND "patrimonio" IS NULL) OR
  ("tipo" = 'Equipamento' AND "patrimonio" IS NOT NULL AND "capacidade" IS NULL));

ALTER TABLE "horario_funcionamento" ADD CONSTRAINT "horario_valido" CHECK (
  "dia_semana" BETWEEN 0 AND 6 AND 0 <= "abre" AND "abre" < "fecha" AND "fecha" <= 1440
  AND "abre" % 30 = 0 AND "fecha" % 30 = 0);

ALTER TABLE "indisponibilidade" ADD CONSTRAINT "indisponibilidade_fim"
  CHECK ("fim" IS NULL OR "fim" > "inicio");

-- Marcas sem booleano: no máximo um lembrete por Reserva e um aviso de fim por Suspensão.
CREATE UNIQUE INDEX "notificacao_lembrete_unico" ON "notificacao" ("reserva_id")
  WHERE "tipo" = 'Lembrete';
CREATE UNIQUE INDEX "notificacao_fim_suspensao" ON "notificacao" ("suspensao_id")
  WHERE "tipo" = 'FimSuspensao';
