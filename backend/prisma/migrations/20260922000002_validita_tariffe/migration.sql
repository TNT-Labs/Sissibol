-- =====================================================
-- Intervallo di validità del tariffario
-- =====================================================
--
-- Il tariffario era identificato dal solo anno, quindi una variazione
-- tariffaria infra-anno non era rappresentabile. Le date di validità la
-- rendono esprimibile; anno_validita resta la chiave usata oggi dal motore
-- di calcolo e non cambia comportamento.

ALTER TABLE "configurazioni_bollo" ADD COLUMN "valido_da" DATE;
ALTER TABLE "configurazioni_bollo" ADD COLUMN "valido_a" DATE;

-- Backfill: l'anno solare di validità, che è la semantica implicita di oggi.
UPDATE "configurazioni_bollo"
SET "valido_da" = make_date("anno_validita", 1, 1),
    "valido_a"  = make_date("anno_validita", 12, 31);

ALTER TABLE "configurazioni_bollo" ALTER COLUMN "valido_da" SET NOT NULL;

ALTER TABLE "configurazioni_bollo"
  ADD CONSTRAINT "configurazioni_bollo_intervallo_valido"
  CHECK ("valido_a" IS NULL OR "valido_a" >= "valido_da");
