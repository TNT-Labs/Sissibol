/**
 * Genera il fixture del golden master: esegue il motore di calcolo su tutto
 * il corpus e registra gli importi prodotti OGGI.
 *
 * Da quel momento `golden-master.spec.ts` rifà lo stesso calcolo e confronta:
 * qualunque refactor che sposti un importo fa fallire il test, e il diff del
 * fixture mostra esattamente quali veicoli sono cambiati e di quanto.
 *
 * Non serve database: lavora sui fixture di tariffario e corpus.
 *
 * Uso:
 *   npx ts-node test/tools/generate-golden.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { computeGolden } from '../golden/compute';
import { GOLDEN_REFERENCE_DATE } from '../helpers/frozen-time';
import type {
  CorpusFixture,
  GoldenEntry,
  TariffarioFixture,
} from '../golden/tariffario.types';

const FIXTURES = join(__dirname, '../golden/fixtures');
const OUTPUT = join(FIXTURES, 'bollo.golden.json');

async function main() {
  const tariffario: TariffarioFixture = JSON.parse(
    readFileSync(join(FIXTURES, 'tariffario.json'), 'utf-8'),
  );
  const corpus: CorpusFixture = JSON.parse(
    readFileSync(join(FIXTURES, 'veicoli.corpus.json'), 'utf-8'),
  );

  const golden = await computeGolden(corpus, tariffario, GOLDEN_REFERENCE_DATE);

  writeFileSync(OUTPUT, JSON.stringify(golden, null, 2) + '\n', 'utf-8');

  console.log(`Golden master salvato in ${OUTPUT}`);
  console.log(`  data di riferimento: ${golden.dataRiferimento}`);
  console.log('  riepilogo:', golden.riepilogo);

  stampaAnalisi(corpus, golden.risultati);
}

/**
 * Riepilogo leggibile dello stato attuale del motore sui dati reali.
 * Non è un test: serve a sapere da dove si parte prima di rifattorizzare.
 */
function stampaAnalisi(corpus: CorpusFixture, risultati: GoldenEntry[]) {
  const occorrenzePerTarga = new Map<string, number>();
  for (const v of corpus.reali) {
    occorrenzePerTarga.set(
      v.targa,
      (v as unknown as { occorrenze?: number }).occorrenze ?? 1,
    );
  }

  const annuali = risultati.filter((r) => r.periodicita === 'ANNUALE');
  const reali = annuali.filter((r) => occorrenzePerTarga.has(r.targa));

  let veicoliZero = 0;
  let veicoliPositivi = 0;
  let veicoliErrore = 0;
  const motiviZero = new Map<string, number>();

  for (const r of reali) {
    const peso = occorrenzePerTarga.get(r.targa) ?? 1;
    if (r.esito === 'ERRORE') {
      veicoliErrore += peso;
      continue;
    }
    if ((r.importoBase ?? 0) === 0) {
      veicoliZero += peso;
      const motivo = (r.note ?? [])[0] ?? 'nessuna nota';
      motiviZero.set(motivo, (motiviZero.get(motivo) ?? 0) + peso);
    } else {
      veicoliPositivi += peso;
    }
  }

  const totale = veicoliZero + veicoliPositivi + veicoliErrore;
  console.log('\n--- Stato attuale del motore sui veicoli reali (periodicità ANNUALE) ---');
  console.log(`  veicoli totali:            ${totale}`);
  console.log(`  con importo calcolato > 0: ${veicoliPositivi}`);
  console.log(`  con importo 0:             ${veicoliZero}`);
  console.log(`  in errore:                 ${veicoliErrore}`);
  if (motiviZero.size > 0) {
    console.log('\n  Motivi dell\'importo 0:');
    for (const [motivo, n] of [...motiviZero.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(5)}x  ${motivo.slice(0, 110)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
