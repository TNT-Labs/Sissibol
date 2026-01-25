-- CreateEnum
CREATE TYPE "TipoCliente" AS ENUM ('PERSONA_FISICA', 'PERSONA_GIURIDICA');

-- Add new columns to clienti table
ALTER TABLE "clienti" ADD COLUMN "tipo_cliente" "TipoCliente" DEFAULT 'PERSONA_GIURIDICA';
ALTER TABLE "clienti" ADD COLUMN "nome" TEXT;
ALTER TABLE "clienti" ADD COLUMN "cognome" TEXT;
ALTER TABLE "clienti" ADD COLUMN "codice_fiscale" TEXT;

-- Make ragione_sociale nullable (it's only for PG)
ALTER TABLE "clienti" ALTER COLUMN "ragione_sociale" DROP NOT NULL;

-- Set default tipo_cliente for existing records
UPDATE "clienti" SET "tipo_cliente" = 'PERSONA_GIURIDICA' WHERE "tipo_cliente" IS NULL;

-- Make tipo_cliente NOT NULL after setting defaults
ALTER TABLE "clienti" ALTER COLUMN "tipo_cliente" SET NOT NULL;
