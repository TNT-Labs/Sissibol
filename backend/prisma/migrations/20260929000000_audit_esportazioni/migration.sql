-- Registro delle esportazioni: chi ha scaricato un report con i dati dei
-- clienti, quando e con quali filtri.
ALTER TYPE "AzioneAudit" ADD VALUE IF NOT EXISTS 'ESPORTAZIONE';
