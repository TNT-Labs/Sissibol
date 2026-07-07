-- Allinea il database allo schema Prisma (drift storico):
-- la FK con ON DELETE CASCADE su esenzioni_bollo era dichiarata nello schema
-- ma non era mai stata creata da una migration.

-- Rimuovi eventuali esenzioni orfane prima di aggiungere il vincolo
DELETE FROM "esenzioni_bollo"
WHERE "id_configurazione" NOT IN (SELECT "id" FROM "configurazioni_bollo");

-- DropIndex
DROP INDEX IF EXISTS "esenzioni_bollo_alimentazione_idx";

-- DropIndex
DROP INDEX IF EXISTS "esenzioni_bollo_tipo_veicolo_idx";

-- DropIndex
DROP INDEX IF EXISTS "tariffe_bollo_categoria_euro_idx";

-- CreateIndex
CREATE INDEX "esenzioni_bollo_id_configurazione_idx" ON "esenzioni_bollo"("id_configurazione");

-- AddForeignKey
ALTER TABLE "esenzioni_bollo" ADD CONSTRAINT "esenzioni_bollo_id_configurazione_fkey" FOREIGN KEY ("id_configurazione") REFERENCES "configurazioni_bollo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "configurazioni_bollo_anno_regione_key" RENAME TO "configurazioni_bollo_anno_validita_regione_key";
