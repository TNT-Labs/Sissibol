/**
 * Costruisce il corpus di veicoli su cui gira il golden master.
 *
 * Il corpus ha due parti:
 *
 * 1. REALI - i veicoli effettivamente presenti in archivio, deduplicati per
 *    "firma di calcolo": due veicoli che differiscono solo per targa o cliente
 *    producono lo stesso importo, quindi ne basta uno per fissare il
 *    comportamento. Ogni rappresentante porta con sé `occorrenze`, così il
 *    fixture dice anche *quanti* veicoli reali ricadono in quel caso.
 *
 *    La data di immatricolazione entra nella firma troncata al mese: il giorno
 *    esatto conta solo a cavallo delle soglie di anzianità (5 e 30 anni), che
 *    sono coperte esplicitamente dai casi sintetici.
 *
 * 2. SINTETICI - casi costruiti a mano per i rami del motore che i dati reali
 *    non toccano (autocarri con peso, motocicli, rimorchi, esenzioni per
 *    alimentazione, soglie di anzianità). Senza questi, un refactor potrebbe
 *    rompere metà del motore senza far fallire nulla.
 *
 * Uso:
 *   DATABASE_URL=... npx ts-node test/tools/build-corpus.ts
 */

import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { join } from 'path';
import type { CorpusFixture, VeicoloFixture } from '../golden/tariffario.types';
import { casiSintetici } from './casi-sintetici';

const OUTPUT = join(__dirname, '../golden/fixtures/veicoli.corpus.json');

const prisma = new PrismaClient();

/** Campi che il motore di calcolo legge davvero. Targa e cliente non contano. */
function firmaDiCalcolo(v: VeicoloFixture): string {
  const meseImm = v.dataImmatricolazione
    ? v.dataImmatricolazione.slice(0, 7) // YYYY-MM
    : null;

  return JSON.stringify([
    v.tipoVeicolo,
    v.classeAmbientale,
    v.regione,
    v.alimentazione,
    v.potenzaKw,
    v.cilindrata,
    v.portataKg,
    v.pesoComplessivoKg,
    v.numeroAssi,
    v.tipoSospensione,
    v.numeroPosti,
    v.massaRimorchiabileKg,
    meseImm,
  ]);
}

async function main() {
  const veicoli = await prisma.veicolo.findMany({ orderBy: { id: 'asc' } });
  console.log(`Veicoli letti dal database: ${veicoli.length}`);

  const perFirma = new Map<string, { veicolo: VeicoloFixture; occorrenze: number }>();

  for (const v of veicoli) {
    const fixture: VeicoloFixture = {
      id: v.id,
      targa: v.targa,
      idCliente: v.idCliente,
      tipoVeicolo: v.tipoVeicolo,
      classeAmbientale: v.classeAmbientale,
      regione: v.regione,
      alimentazione: v.alimentazione,
      potenzaKw: v.potenzaKw === null ? null : String(v.potenzaKw),
      cilindrata: v.cilindrata,
      portataKg: v.portataKg,
      pesoComplessivoKg: v.pesoComplessivoKg,
      numeroAssi: v.numeroAssi,
      tipoSospensione: v.tipoSospensione,
      numeroPosti: v.numeroPosti,
      massaRimorchiabileKg: v.massaRimorchiabileKg,
      dataImmatricolazione: v.dataImmatricolazione
        ? v.dataImmatricolazione.toISOString().slice(0, 10)
        : null,
      attivo: v.attivo,
    };

    const firma = firmaDiCalcolo(fixture);
    const esistente = perFirma.get(firma);
    if (esistente) {
      esistente.occorrenze++;
    } else {
      perFirma.set(firma, { veicolo: fixture, occorrenze: 1 });
    }
  }

  // Ordine stabile: il fixture non deve cambiare fra due esecuzioni identiche.
  const reali = Array.from(perFirma.values())
    .sort((a, b) => b.occorrenze - a.occorrenze || a.veicolo.targa.localeCompare(b.veicolo.targa))
    .map(({ veicolo, occorrenze }) => ({ ...veicolo, occorrenze }));

  const corpus: CorpusFixture = {
    generatoIl: new Date().toISOString(),
    origine:
      'import/csv (archivio Access) importato con prisma/import-mdb.js, deduplicato per firma di calcolo',
    reali: reali as VeicoloFixture[],
    sintetici: casiSintetici(),
  };

  writeFileSync(OUTPUT, JSON.stringify(corpus, null, 2) + '\n', 'utf-8');

  console.log(`Corpus salvato in ${OUTPUT}`);
  console.log(`  veicoli reali: ${veicoli.length} -> ${reali.length} firme distinte`);
  console.log(`  casi sintetici: ${corpus.sintetici.length}`);
  console.log('\n  Firme reali più frequenti:');
  for (const r of reali.slice(0, 8)) {
    const v = r as VeicoloFixture & { occorrenze: number };
    console.log(
      `    ${String(v.occorrenze).padStart(5)}x  tipo=${v.tipoVeicolo ?? 'null'} kw=${v.potenzaKw ?? 'null'} regione=${v.regione ?? 'null'} euro=${v.classeAmbientale ?? 'null'}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
