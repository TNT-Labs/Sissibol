-- CreateEnum
CREATE TYPE "Periodicita" AS ENUM ('QUADRIMESTRALE', 'ANNUALE');

-- Migrate existing data: extract month and year from data_scadenza
-- First add new columns as nullable
ALTER TABLE "scadenze" ADD COLUMN "mese_scadenza" INTEGER;
ALTER TABLE "scadenze" ADD COLUMN "anno_scadenza" INTEGER;
ALTER TABLE "scadenze" ADD COLUMN "periodicita" "Periodicita" DEFAULT 'ANNUALE';

-- Migrate existing data
UPDATE "scadenze" SET
    "mese_scadenza" = EXTRACT(MONTH FROM "data_scadenza"),
    "anno_scadenza" = EXTRACT(YEAR FROM "data_scadenza")
WHERE "data_scadenza" IS NOT NULL;

-- Set default for any NULL values (if data_scadenza was NULL)
UPDATE "scadenze" SET
    "mese_scadenza" = EXTRACT(MONTH FROM CURRENT_DATE),
    "anno_scadenza" = EXTRACT(YEAR FROM CURRENT_DATE)
WHERE "mese_scadenza" IS NULL OR "anno_scadenza" IS NULL;

-- Make new columns NOT NULL
ALTER TABLE "scadenze" ALTER COLUMN "mese_scadenza" SET NOT NULL;
ALTER TABLE "scadenze" ALTER COLUMN "anno_scadenza" SET NOT NULL;
ALTER TABLE "scadenze" ALTER COLUMN "periodicita" SET NOT NULL;

-- Drop old column
ALTER TABLE "scadenze" DROP COLUMN "data_scadenza";
