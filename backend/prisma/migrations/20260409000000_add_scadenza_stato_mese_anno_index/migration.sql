-- AddIndex: indice composito su scadenze(stato, mese_scadenza, anno_scadenza)
-- Ottimizza la query getScadenzeInScadenza che filtra per stato + mese + anno
CREATE INDEX "scadenze_stato_mese_scadenza_anno_scadenza_idx" ON "scadenze"("stato", "mese_scadenza", "anno_scadenza");
