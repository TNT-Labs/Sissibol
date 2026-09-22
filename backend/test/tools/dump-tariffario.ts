/**
 * Estrae dal database il tariffario completo (configurazioni, tariffe,
 * esenzioni) e lo salva come fixture per il golden master.
 *
 * Il fixture è lo snapshot di ciò che il seed produce oggi: serve a far girare
 * il motore di calcolo in CI senza database. Va rigenerato solo quando il seed
 * o le tariffe cambiano davvero.
 *
 * Uso:
 *   DATABASE_URL=... npx ts-node test/tools/dump-tariffario.ts
 */

import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { join } from 'path';
import type {
  ConfigurazioneFixture,
  EsenzioneFixture,
  TariffaFixture,
  TariffarioFixture,
} from '../golden/tariffario.types';

const OUTPUT = join(__dirname, '../golden/fixtures/tariffario.json');

const prisma = new PrismaClient();

function decToString(v: unknown): string {
  return String(v);
}

function decToStringOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

async function main() {
  const configurazioni = await prisma.configurazioneBollo.findMany({
    include: { tariffe: { orderBy: { id: 'asc' } } },
    orderBy: { id: 'asc' },
  });

  const out: ConfigurazioneFixture[] = [];

  for (const c of configurazioni) {
    // Le esenzioni vanno lette con i nomi di colonna del database, perché è
    // così che il motore di calcolo le riceve ($queryRaw).
    const esenzioni = await prisma.$queryRaw<
      Array<Record<string, unknown>>
    >`SELECT * FROM "esenzioni_bollo" WHERE "id_configurazione" = ${c.id} ORDER BY id ASC`;

    const tariffe: TariffaFixture[] = c.tariffe.map((t) => ({
      id: t.id,
      tipoVeicolo: t.tipoVeicolo,
      categoriaEuro: t.categoriaEuro,
      unitaMisura: t.unitaMisura,
      sogliaMin: decToStringOrNull(t.sogliaMin),
      sogliaMax: decToStringOrNull(t.sogliaMax),
      importoUnitario: decToString(t.importoUnitario),
      importoFisso: decToStringOrNull(t.importoFisso),
      tipoSospensione: t.tipoSospensione,
      periodicita: t.periodicita,
      descrizione: t.descrizione,
      ordine: t.ordine,
    }));

    out.push({
      id: c.id,
      annoValidita: c.annoValidita,
      regione: c.regione,
      scontoRid: decToString(c.scontoRid),
      attivo: c.attivo,
      note: c.note,
      tariffe,
      esenzioni: esenzioni.map(
        (e): EsenzioneFixture => ({
          id: Number(e.id),
          id_configurazione: Number(e.id_configurazione),
          tipo_esenzione: e.tipo_esenzione as 'TOTALE' | 'PARZIALE',
          percentuale_riduzione: decToStringOrNull(e.percentuale_riduzione),
          tipo_veicolo: (e.tipo_veicolo as string) ?? null,
          alimentazione: (e.alimentazione as string) ?? null,
          anni_da_immatricolazione:
            e.anni_da_immatricolazione === null ? null : Number(e.anni_da_immatricolazione),
          descrizione: e.descrizione as string,
          note: (e.note as string) ?? null,
        }),
      ),
    });
  }

  const fixture: TariffarioFixture = {
    generatoIl: new Date().toISOString(),
    origine: 'prisma/seed.js su schema migrato (prisma migrate deploy)',
    configurazioni: out,
  };

  writeFileSync(OUTPUT, JSON.stringify(fixture, null, 2) + '\n', 'utf-8');

  const totTariffe = out.reduce((s, c) => s + c.tariffe.length, 0);
  const totEsenzioni = out.reduce((s, c) => s + c.esenzioni.length, 0);
  console.log(`Tariffario salvato in ${OUTPUT}`);
  console.log(
    `  configurazioni: ${out.length}  tariffe: ${totTariffe}  esenzioni: ${totEsenzioni}`,
  );
  for (const c of out) {
    console.log(`  - ${c.regione} ${c.annoValidita}: ${c.tariffe.length} tariffe, ${c.esenzioni.length} esenzioni, sconto RID ${c.scontoRid}%`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
