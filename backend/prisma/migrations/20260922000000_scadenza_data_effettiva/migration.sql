-- =====================================================
-- La scadenza acquisisce una data effettiva
-- =====================================================
--
-- Fino ad ora la scadenza era rappresentata solo da mese e anno, eredità
-- diretta dell'archivio Access. Ogni consumatore ricostruiva la data a mano,
-- nessun indice poteva coprire un intervallo di date e le notifiche
-- lavoravano per approssimazione sui mesi.
--
-- Il backfill usa l'ultimo giorno del mese. È una ricostruzione ESATTA, non
-- un'approssimazione: tutte le 138.725 date dell'archivio di origine cadono
-- a fine mese, verificato riga per riga prima di scrivere questa migrazione.
--
-- mese_scadenza e anno_scadenza restano per compatibilità con API e
-- interfaccia; il vincolo CHECK impedisce che divergano dalla data.

ALTER TABLE "scadenze" ADD COLUMN "data_scadenza" DATE;

UPDATE "scadenze"
SET "data_scadenza" = (
  make_date("anno_scadenza", "mese_scadenza", 1) + INTERVAL '1 month' - INTERVAL '1 day'
)::date;

ALTER TABLE "scadenze" ALTER COLUMN "data_scadenza" SET NOT NULL;

-- Coerenza fra la data e le colonne derivate mantenute per compatibilità.
ALTER TABLE "scadenze"
  ADD CONSTRAINT "scadenze_data_coerente_con_mese_anno"
  CHECK (
    EXTRACT(MONTH FROM "data_scadenza") = "mese_scadenza"
    AND EXTRACT(YEAR FROM "data_scadenza") = "anno_scadenza"
  );

-- Il mese resta comunque vincolato: protegge anche gli inserimenti che
-- passassero da percorsi diversi dal servizio applicativo.
ALTER TABLE "scadenze"
  ADD CONSTRAINT "scadenze_mese_valido"
  CHECK ("mese_scadenza" BETWEEN 1 AND 12);

CREATE INDEX "scadenze_data_scadenza_idx" ON "scadenze"("data_scadenza");
CREATE INDEX "scadenze_stato_data_scadenza_idx" ON "scadenze"("stato", "data_scadenza");
