-- =====================================================
-- Vincoli di dominio sui campi del veicolo
-- =====================================================
--
-- Il motore di calcolo seleziona le tariffe confrontando questi campi per
-- uguaglianza esatta. Una variante di scrittura ("autovettura" minuscolo,
-- "Autocarro " con spazio finale, "EURO 4") non corrisponde ad alcuna tariffa
-- e produce un bollo di zero euro senza alcun errore: l'importo sbagliato
-- sembra valido. Finora nulla impediva a un client dell'API di scriverli.
--
-- I valori NULL restano ammessi: i campi non valorizzati sono una lacuna dei
-- dati da sanare, non un errore di validita'. Il vincolo impedisce che la
-- situazione peggiori, non pretende di risolverla.
--
-- Prima si normalizzano gli spazi superflui, poi si vincolano i valori.

UPDATE "veicoli" SET
  "tipo_veicolo"      = NULLIF(btrim("tipo_veicolo"), ''),
  "classe_ambientale" = NULLIF(btrim("classe_ambientale"), ''),
  "alimentazione"     = NULLIF(btrim("alimentazione"), ''),
  "tipo_sospensione"  = NULLIF(btrim("tipo_sospensione"), ''),
  "regione"           = NULLIF(btrim("regione"), '');

-- Tipi veicolo: elenco del tariffario, piu' i due valori prodotti dall'import
-- dall'archivio Access. 'Motrice' e 'Altro' non hanno alcuna tariffa
-- corrispondente e vanno riclassificati durante la bonifica dei dati: sono
-- ammessi qui per non rifiutare dati gia' presenti, non perche' siano corretti.
ALTER TABLE "veicoli" ADD CONSTRAINT "veicoli_tipo_veicolo_valido" CHECK (
  "tipo_veicolo" IS NULL OR "tipo_veicolo" IN (
    'Autovettura', 'Autoveicolo uso promiscuo', 'Autobus', 'Autocarro',
    'Autotreno', 'Autoarticolato', 'Trattore stradale', 'Autoveicolo speciale',
    'Autocaravan', 'Motociclo', 'Ciclomotore', 'Motocarro', 'Motofurgone',
    'Quadriciclo', 'Rimorchio', 'Rimorchio speciale', 'Semirimorchio',
    'Rimorchio trasporto persone', 'Macchina agricola', 'Macchina operatrice',
    'Motrice', 'Altro'
  )
);

ALTER TABLE "veicoli" ADD CONSTRAINT "veicoli_classe_ambientale_valida" CHECK (
  "classe_ambientale" IS NULL OR "classe_ambientale" IN (
    'Euro 0', 'Euro 1', 'Euro 2', 'Euro 3', 'Euro 4', 'Euro 5', 'Euro 5a',
    'Euro 5b', 'Euro 6', 'Euro 6a', 'Euro 6b', 'Euro 6c', 'Euro 6d-TEMP',
    'Euro 6d', 'Euro 6d-ISC', 'Euro 6d-ISC-FCM', 'Euro 6e', 'Euro 7'
  )
);

ALTER TABLE "veicoli" ADD CONSTRAINT "veicoli_alimentazione_valida" CHECK (
  "alimentazione" IS NULL OR "alimentazione" IN (
    'Benzina', 'Diesel', 'GPL', 'Metano', 'Ibrido benzina', 'Ibrido diesel',
    'Elettrico', 'Idrogeno'
  )
);

ALTER TABLE "veicoli" ADD CONSTRAINT "veicoli_tipo_sospensione_valido" CHECK (
  "tipo_sospensione" IS NULL OR "tipo_sospensione" IN ('Pneumatiche', 'Non pneumatiche')
);

-- La regione determina quale tariffario viene applicato: un valore non
-- riconosciuto fa fallire il calcolo con un'eccezione.
ALTER TABLE "veicoli" ADD CONSTRAINT "veicoli_regione_valida" CHECK (
  "regione" IS NULL OR "regione" IN (
    'Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna',
    'Friuli-Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche',
    'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana',
    'Trentino-Alto Adige', 'Umbria', 'Valle d''Aosta', 'Veneto'
  )
);

-- Grandezze fisiche: lo zero significava "non rilevato", non "zero".
--
-- L'import dall'archivio scriveva 0 dove il dato mancava: 2.437 veicoli su
-- 2.438 avevano potenza 0 e NESSUNO aveva potenza NULL. Cosi' la lacuna era
-- invisibile: una query su IS NULL non restituiva nulla e 0 sembrava un
-- valore. Normalizzarlo a NULL rende il dato mancante interrogabile ed e' la
-- premessa per sapere quali veicoli vanno completati.
--
-- Il calcolo non cambia: il motore tratta gia' 0 e NULL allo stesso modo
-- (`veicolo.potenzaKw ? ... : 0`), come verifica il golden master.
UPDATE "veicoli" SET "potenza_kw" = NULL WHERE "potenza_kw" = 0;
UPDATE "veicoli" SET "cilindrata" = NULL WHERE "cilindrata" = 0;
UPDATE "veicoli" SET "portata_kg" = NULL WHERE "portata_kg" = 0;
UPDATE "veicoli" SET "peso_complessivo_kg" = NULL WHERE "peso_complessivo_kg" = 0;
UPDATE "veicoli" SET "numero_assi" = NULL WHERE "numero_assi" = 0;
UPDATE "veicoli" SET "numero_posti" = NULL WHERE "numero_posti" = 0;
UPDATE "veicoli" SET "massa_rimorchiabile_kg" = NULL WHERE "massa_rimorchiabile_kg" = 0;

-- Da qui in avanti un valore presente e' un valore misurato.
ALTER TABLE "veicoli" ADD CONSTRAINT "veicoli_grandezze_positive" CHECK (
  ("potenza_kw" IS NULL OR "potenza_kw" > 0)
  AND ("cilindrata" IS NULL OR "cilindrata" > 0)
  AND ("portata_kg" IS NULL OR "portata_kg" > 0)
  AND ("peso_complessivo_kg" IS NULL OR "peso_complessivo_kg" > 0)
  AND ("numero_assi" IS NULL OR "numero_assi" > 0)
  AND ("numero_posti" IS NULL OR "numero_posti" > 0)
  AND ("massa_rimorchiabile_kg" IS NULL OR "massa_rimorchiabile_kg" > 0)
);

-- Gli importi non possono essere negativi.
ALTER TABLE "scadenze" ADD CONSTRAINT "scadenze_importo_non_negativo" CHECK (
  "importo_previsto" IS NULL OR "importo_previsto" >= 0
);

ALTER TABLE "pagamenti" ADD CONSTRAINT "pagamenti_importo_non_negativo" CHECK (
  "importo_pagato" >= 0
);
