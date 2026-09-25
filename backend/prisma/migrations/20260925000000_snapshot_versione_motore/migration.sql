-- =====================================================
-- Snapshot del calcolo: versione del motore e assunzioni
-- =====================================================
--
-- Lo snapshot associato a un pagamento serve a difendere un importo anni dopo.
-- Con la riscrittura del motore di calcolo lo stesso veicolo può produrre
-- importi diversi a seconda della versione delle regole: senza registrarla,
-- uno snapshot storico non è più interpretabile.
--
-- Le righe esistenti restano con versione NULL: sono state prodotte dal motore
-- 1.x, precedente alla riscrittura.
--
-- Le assunzioni sono i benefici che il motore non ha potuto valutare per
-- mancanza di dati (per esempio una riduzione per anzianità senza data di
-- immatricolazione): fanno parte delle condizioni in cui l'importo è stato
-- determinato.

ALTER TABLE "snapshot_calcolo_bollo" ADD COLUMN "versione_motore" TEXT;
ALTER TABLE "snapshot_calcolo_bollo" ADD COLUMN "assunzioni" JSONB;
