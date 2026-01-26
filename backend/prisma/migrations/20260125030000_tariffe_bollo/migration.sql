-- Creazione tabelle per configurazione tariffe bollo auto

-- Configurazione generale per anno/regione
CREATE TABLE "configurazioni_bollo" (
    "id" SERIAL PRIMARY KEY,
    "anno_validita" INTEGER NOT NULL,
    "regione" TEXT NOT NULL,
    "sconto_rid" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "configurazioni_bollo_anno_regione_key" UNIQUE ("anno_validita", "regione")
);

-- Tariffe specifiche per tipo veicolo
CREATE TABLE "tariffe_bollo" (
    "id" SERIAL PRIMARY KEY,
    "id_configurazione" INTEGER NOT NULL,
    "tipo_veicolo" TEXT NOT NULL,
    "categoria_euro" TEXT,
    "unita_misura" TEXT NOT NULL,
    "soglia_min" DECIMAL(10,2),
    "soglia_max" DECIMAL(10,2),
    "importo_unitario" DECIMAL(10,4) NOT NULL,
    "importo_fisso" DECIMAL(10,2),
    "tipo_sospensione" TEXT,
    "periodicita" TEXT NOT NULL DEFAULT 'ANNUALE',
    "descrizione" TEXT,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tariffe_bollo_id_configurazione_fkey" FOREIGN KEY ("id_configurazione")
        REFERENCES "configurazioni_bollo"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Esenzioni e riduzioni
CREATE TABLE "esenzioni_bollo" (
    "id" SERIAL PRIMARY KEY,
    "id_configurazione" INTEGER NOT NULL,
    "tipo_esenzione" TEXT NOT NULL,
    "percentuale_riduzione" DECIMAL(5,2),
    "tipo_veicolo" TEXT,
    "alimentazione" TEXT,
    "anni_da_immatricolazione" INTEGER,
    "descrizione" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Indici per performance
CREATE INDEX "tariffe_bollo_tipo_veicolo_idx" ON "tariffe_bollo"("tipo_veicolo");
CREATE INDEX "tariffe_bollo_categoria_euro_idx" ON "tariffe_bollo"("categoria_euro");
CREATE INDEX "esenzioni_bollo_tipo_veicolo_idx" ON "esenzioni_bollo"("tipo_veicolo");
CREATE INDEX "esenzioni_bollo_alimentazione_idx" ON "esenzioni_bollo"("alimentazione");
