-- Performance indexes for faster queries

-- Veicoli: indice su FK cliente e ricerca targa
CREATE INDEX IF NOT EXISTS "veicoli_id_cliente_idx" ON "veicoli"("id_cliente");
CREATE INDEX IF NOT EXISTS "veicoli_targa_idx" ON "veicoli"("targa");

-- Scadenze: indice su FK veicolo e ricerche per stato/anno
CREATE INDEX IF NOT EXISTS "scadenze_id_veicolo_idx" ON "scadenze"("id_veicolo");
CREATE INDEX IF NOT EXISTS "scadenze_stato_anno_scadenza_idx" ON "scadenze"("stato", "anno_scadenza");
CREATE INDEX IF NOT EXISTS "scadenze_anno_scadenza_mese_scadenza_idx" ON "scadenze"("anno_scadenza", "mese_scadenza");

-- Pagamenti: indice su FK scadenza e ricerche per data
CREATE INDEX IF NOT EXISTS "pagamenti_id_scadenza_idx" ON "pagamenti"("id_scadenza");
CREATE INDEX IF NOT EXISTS "pagamenti_data_pagamento_idx" ON "pagamenti"("data_pagamento");

-- Tariffe: indice su FK configurazione e tipo veicolo
CREATE INDEX IF NOT EXISTS "tariffe_bollo_id_configurazione_idx" ON "tariffe_bollo"("id_configurazione");
CREATE INDEX IF NOT EXISTS "tariffe_bollo_tipo_veicolo_idx" ON "tariffe_bollo"("tipo_veicolo");
