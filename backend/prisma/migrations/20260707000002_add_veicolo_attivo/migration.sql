-- Soft-delete per i veicoli: flag attivo (come già presente sui clienti)
ALTER TABLE "veicoli" ADD COLUMN "attivo" BOOLEAN NOT NULL DEFAULT true;
