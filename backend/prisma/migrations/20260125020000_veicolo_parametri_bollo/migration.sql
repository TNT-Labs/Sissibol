-- Aggiunta parametri per calcolo bollo auto (tariffario Regione Lombardia 2026)
-- AlterTable
ALTER TABLE "veicoli" ADD COLUMN "alimentazione" TEXT;
ALTER TABLE "veicoli" ADD COLUMN "potenza_kw" DECIMAL(10,2);
ALTER TABLE "veicoli" ADD COLUMN "cilindrata" INTEGER;
ALTER TABLE "veicoli" ADD COLUMN "portata_kg" INTEGER;
ALTER TABLE "veicoli" ADD COLUMN "peso_complessivo_kg" INTEGER;
ALTER TABLE "veicoli" ADD COLUMN "numero_assi" INTEGER;
ALTER TABLE "veicoli" ADD COLUMN "tipo_sospensione" TEXT;
ALTER TABLE "veicoli" ADD COLUMN "numero_posti" INTEGER;
ALTER TABLE "veicoli" ADD COLUMN "massa_rimorchiabile_kg" INTEGER;
ALTER TABLE "veicoli" ADD COLUMN "data_immatricolazione" DATE;
