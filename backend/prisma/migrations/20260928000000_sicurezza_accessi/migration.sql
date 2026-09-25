-- =====================================================
-- Sicurezza degli accessi
-- =====================================================
--
-- - deve_cambiare_password: l'utente deve scegliere una nuova password prima
--   di poter usare l'applicazione (password assegnata da un amministratore,
--   password iniziale, password di prima dell'introduzione della politica).
-- - tentativi_falliti / bloccato_fino_a: sospensione temporanea dell'accesso
--   dopo ripetuti errori di password, contro i tentativi a forza bruta.
-- - password_cambiata_il: data dell'ultimo cambio.
--
-- Le password esistenti sono state accettate con soli 6 caratteri e nessun
-- altro controllo: tutti gli utenti dovranno sceglierne una conforme alla
-- nuova politica al prossimo accesso.

ALTER TABLE "utenti"
  ADD COLUMN "deve_cambiare_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tentativi_falliti" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bloccato_fino_a" TIMESTAMP(3),
  ADD COLUMN "password_cambiata_il" TIMESTAMP(3);

ALTER TABLE "utenti"
  ADD CONSTRAINT "utenti_tentativi_non_negativi" CHECK ("tentativi_falliti" >= 0);

UPDATE "utenti" SET "deve_cambiare_password" = true;
