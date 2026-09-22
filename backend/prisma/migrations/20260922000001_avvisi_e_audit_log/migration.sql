-- =====================================================
-- Avvisi al cliente e registro delle modifiche
-- =====================================================
--
-- AVVISI
-- L'archivio Access tracciava, per ogni scadenza, la data del primo e del
-- secondo avviso al cliente (3.505 e 585 righe valorizzate). La prima
-- migrazione non aveva importato quelle colonne, facendo perdere allo studio
-- la prova di aver avvisato il cliente: il requisito principale di uno
-- scadenziario. Questa tabella ripristina quella tracciatura.
--
-- AUDIT LOG
-- Registro append-only delle modifiche che incidono sugli importi. Senza,
-- una contestazione su un bollo non è difendibile.

CREATE TYPE "TipoAvviso" AS ENUM ('PRIMO', 'SECONDO', 'SOLLECITO');
CREATE TYPE "CanaleAvviso" AS ENUM ('EMAIL', 'ARCHIVIO');
CREATE TYPE "EsitoAvviso" AS ENUM ('DA_INVIARE', 'INVIATO', 'ERRORE');
CREATE TYPE "AzioneAudit" AS ENUM ('CREAZIONE', 'MODIFICA', 'ELIMINAZIONE');

CREATE TABLE "avvisi" (
    "id" SERIAL NOT NULL,
    "id_scadenza" INTEGER NOT NULL,
    "tipo" "TipoAvviso" NOT NULL,
    "canale" "CanaleAvviso" NOT NULL DEFAULT 'EMAIL',
    "destinatario" TEXT,
    "data_invio" DATE,
    "esito" "EsitoAvviso" NOT NULL DEFAULT 'DA_INVIARE',
    "errore" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avvisi_pkey" PRIMARY KEY ("id")
);

-- Un solo avviso per tipo su una data scadenza: rende idempotente la
-- generazione degli avvisi ed esclude i doppi invii.
CREATE UNIQUE INDEX "avvisi_id_scadenza_tipo_key" ON "avvisi"("id_scadenza", "tipo");
CREATE INDEX "avvisi_esito_data_invio_idx" ON "avvisi"("esito", "data_invio");
CREATE INDEX "avvisi_data_invio_idx" ON "avvisi"("data_invio");

ALTER TABLE "avvisi"
  ADD CONSTRAINT "avvisi_id_scadenza_fkey"
  FOREIGN KEY ("id_scadenza") REFERENCES "scadenze"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un avviso risultato INVIATO deve avere una data di invio.
ALTER TABLE "avvisi"
  ADD CONSTRAINT "avvisi_inviato_ha_data"
  CHECK ("esito" <> 'INVIATO' OR "data_invio" IS NOT NULL);

CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "entita" TEXT NOT NULL,
    "id_entita" INTEGER NOT NULL,
    "azione" "AzioneAudit" NOT NULL,
    "utente" TEXT,
    "dati_prima" JSONB,
    "dati_dopo" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_log_entita_id_entita_createdAt_idx" ON "audit_log"("entita", "id_entita", "createdAt");
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");
