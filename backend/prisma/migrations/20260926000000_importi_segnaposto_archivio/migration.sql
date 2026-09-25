-- =====================================================
-- Importi segnaposto dell'archivio: da 1 euro a "mancante"
-- =====================================================
--
-- L'archivio Access riportava 1 euro come importo delle scadenze di cui non
-- conosceva il bollo: 98.084 scadenze importate hanno importo esattamente
-- 1 euro, e nessun importo reale e' compreso fra 1 e 20,98 euro. Il valore
-- sembrava un importo valido: il pagamento multiplo avrebbe registrato
-- pagamenti da 1 euro sulle 61.802 scadenze ancora da pagare.
--
-- Qui il segnaposto diventa NULL, cioe' importo mancante, solo sulle
-- scadenze NON pagate e prive di pagamenti. Le scadenze pagate (10.873, con
-- un pagamento registrato di 1 euro) restano intatte: sono fatti storici.
--
-- Ogni scadenza modificata viene registrata nel registro delle modifiche con
-- il valore precedente: la migrazione e' tracciabile e reversibile.
--
-- Scritta come istruzione unica: aggiornamento e registrazione avvengono
-- insieme o per niente, e i test di integrazione possono eseguirla su dati
-- costruiti apposta.

WITH aggiornate AS (
  UPDATE "scadenze" AS s
  SET "importo_previsto" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE s."importo_previsto" = 1
    AND s."stato" <> 'PAGATO'
    AND NOT EXISTS (
      SELECT 1 FROM "pagamenti" AS p WHERE p."id_scadenza" = s."id"
    )
  RETURNING s."id"
)
INSERT INTO "audit_log" ("entita", "id_entita", "azione", "utente", "dati_prima", "dati_dopo", "note")
SELECT
  'scadenza',
  a."id",
  'MODIFICA',
  NULL,
  jsonb_build_object('importoPrevisto', '1'),
  jsonb_build_object('importoPrevisto', NULL),
  'Migrazione 20260926000000_importi_segnaposto_archivio: importo segnaposto di 1 euro dell''archivio Access rimosso (importo mancante)'
FROM aggiornate AS a;
