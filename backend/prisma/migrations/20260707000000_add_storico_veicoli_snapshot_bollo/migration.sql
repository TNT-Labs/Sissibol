-- CreateEnum
CREATE TYPE "TipoModificaVeicolo" AS ENUM ('CAMBIO_TARGA', 'CAMBIO_PROPRIETARIO', 'CAMBIO_TARGA_E_PROPRIETARIO');

-- CreateTable
CREATE TABLE "storico_veicoli" (
    "id" SERIAL NOT NULL,
    "id_veicolo" INTEGER NOT NULL,
    "tipo_modifica" "TipoModificaVeicolo" NOT NULL,
    "targa_precedente" TEXT,
    "id_cliente_precedente" INTEGER,
    "targa_nuova" TEXT,
    "id_cliente_nuovo" INTEGER,
    "data_modifica" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivazione" TEXT,
    "utente_modifica" TEXT,

    CONSTRAINT "storico_veicoli_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshot_calcolo_bollo" (
    "id" SERIAL NOT NULL,
    "id_pagamento" INTEGER NOT NULL,
    "veicolo_snapshot" JSONB NOT NULL,
    "tariffe_applicate" JSONB NOT NULL,
    "esenzioni_applicate" JSONB NOT NULL,
    "importo_base" DECIMAL(10,2) NOT NULL,
    "importo_ridotto" DECIMAL(10,2),
    "sconto_rid_applicato" DECIMAL(5,2) NOT NULL,
    "dettaglio_calcolo" TEXT NOT NULL,
    "id_configurazione" INTEGER NOT NULL,
    "anno_configurazione" INTEGER NOT NULL,
    "regione_configurazione" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshot_calcolo_bollo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storico_veicoli_id_veicolo_data_modifica_idx" ON "storico_veicoli"("id_veicolo", "data_modifica");

-- CreateIndex
CREATE UNIQUE INDEX "snapshot_calcolo_bollo_id_pagamento_key" ON "snapshot_calcolo_bollo"("id_pagamento");

-- AddForeignKey
ALTER TABLE "storico_veicoli" ADD CONSTRAINT "storico_veicoli_id_veicolo_fkey" FOREIGN KEY ("id_veicolo") REFERENCES "veicoli"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshot_calcolo_bollo" ADD CONSTRAINT "snapshot_calcolo_bollo_id_pagamento_fkey" FOREIGN KEY ("id_pagamento") REFERENCES "pagamenti"("id") ON DELETE CASCADE ON UPDATE CASCADE;
