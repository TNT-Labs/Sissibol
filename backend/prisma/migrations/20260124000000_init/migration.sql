-- CreateEnum
CREATE TYPE "Ruolo" AS ENUM ('ADMIN', 'OPERATORE');

-- CreateEnum
CREATE TYPE "StatoScadenza" AS ENUM ('DA_PAGARE', 'PAGATO', 'SCADUTO');

-- CreateTable
CREATE TABLE "utenti" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "ruolo" "Ruolo" NOT NULL DEFAULT 'OPERATORE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utenti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clienti" (
    "id" SERIAL NOT NULL,
    "ragione_sociale" TEXT NOT NULL,
    "partita_iva" TEXT,
    "indirizzo" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clienti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "veicoli" (
    "id" SERIAL NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "targa" TEXT NOT NULL,
    "tipo_veicolo" TEXT,
    "classe_ambientale" TEXT,
    "regione" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "veicoli_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scadenze" (
    "id" SERIAL NOT NULL,
    "id_veicolo" INTEGER NOT NULL,
    "data_scadenza" DATE NOT NULL,
    "importo_previsto" DECIMAL(10,2),
    "stato" "StatoScadenza" NOT NULL DEFAULT 'DA_PAGARE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scadenze_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamenti" (
    "id" SERIAL NOT NULL,
    "id_scadenza" INTEGER NOT NULL,
    "data_pagamento" DATE NOT NULL,
    "importo_pagato" DECIMAL(10,2) NOT NULL,
    "metodo_pagamento" TEXT,
    "ricevuta_file" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pagamenti_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utenti_email_key" ON "utenti"("email");

-- AddForeignKey
ALTER TABLE "veicoli" ADD CONSTRAINT "veicoli_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clienti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scadenze" ADD CONSTRAINT "scadenze_id_veicolo_fkey" FOREIGN KEY ("id_veicolo") REFERENCES "veicoli"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamenti" ADD CONSTRAINT "pagamenti_id_scadenza_fkey" FOREIGN KEY ("id_scadenza") REFERENCES "scadenze"("id") ON DELETE CASCADE ON UPDATE CASCADE;
