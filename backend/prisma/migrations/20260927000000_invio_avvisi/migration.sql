-- =====================================================
-- Invio degli avvisi al cliente (Fase 3)
-- =====================================================
--
-- Fino alla fase 1 gli avvisi venivano maturati e registrati, ma non inviati.
-- Questa migrazione aggiunge ciò che serve a inviarli in modo affidabile e a
-- poterlo dimostrare:
--
-- - IN_INVIO: l'avviso è stato preso in carico da un invio in corso. Serve a
--   non spedirlo due volte se due invii partono insieme, e a riconoscere un
--   invio interrotto (esito incerto) invece di ripeterlo alla cieca.
-- - ANNULLATO: l'avviso non va più inviato (scadenza pagata, veicolo o cliente
--   disattivato, avviso superato dal secondo). Resta registrato con il motivo.
-- - tentativi / prossimo_tentativo: ritentativi con attesa crescente per gli
--   errori temporanei del server di posta.
-- - inviato_il, id_messaggio, oggetto, testo: la prova dell'invio, cioè
--   quando, con quale identificativo SMTP e con quale contenuto.
-- - clienti.avvisi_email: il cliente può chiedere di non ricevere avvisi.
--
-- I nuovi valori dell'enum non sono usati in questa migrazione: PostgreSQL
-- non ammette di usarli nella stessa transazione che li aggiunge.

ALTER TYPE "EsitoAvviso" ADD VALUE IF NOT EXISTS 'IN_INVIO';
ALTER TYPE "EsitoAvviso" ADD VALUE IF NOT EXISTS 'ANNULLATO';

ALTER TABLE "avvisi"
  ADD COLUMN "tentativi" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "prossimo_tentativo" TIMESTAMP(3),
  ADD COLUMN "inviato_il" TIMESTAMP(3),
  ADD COLUMN "id_messaggio" TEXT,
  ADD COLUMN "oggetto" TEXT,
  ADD COLUMN "testo" TEXT;

ALTER TABLE "avvisi"
  ADD CONSTRAINT "avvisi_tentativi_non_negativi" CHECK ("tentativi" >= 0);

-- La coda d'invio legge gli avvisi per esito e momento del prossimo tentativo.
CREATE INDEX "avvisi_esito_prossimo_tentativo_idx" ON "avvisi"("esito", "prossimo_tentativo");

ALTER TABLE "clienti"
  ADD COLUMN "avvisi_email" BOOLEAN NOT NULL DEFAULT true;
