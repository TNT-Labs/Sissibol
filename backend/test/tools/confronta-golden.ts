/**
 * Confronto semantico fra due golden master.
 *
 * Quando una modifica cambia di proposito il comportamento del motore, il
 * diff testuale del fixture è troppo rumoroso per essere letto. Questo
 * strumento classifica ogni voce cambiata in una categoria e le elenca, così
 * che ogni importo spostato abbia una spiegazione e nessuno passi inosservato.
 *
 * Uso:
 *   npx ts-node test/tools/confronta-golden.ts <golden-prima.json> <golden-dopo.json>
 *
 * Esce con codice 1 se trova variazioni di importo fra due esiti calcolati:
 * sono le uniche che non possono essere accettate senza guardarle una a una.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { CorpusFixture, GoldenEntry, GoldenFixture } from '../golden/tariffario.types';

type Categoria =
  | 'INVARIATO'
  | 'ZERO -> NON_CALCOLABILE'
  | 'ERRORE -> NON_CALCOLABILE'
  | 'IMPORTO -> NON_CALCOLABILE'
  | 'ESENTE -> CALCOLATO'
  | 'IMPORTO CAMBIATO'
  | 'ALTRO';

function chiave(e: GoldenEntry): string {
  return `${e.targa}|${e.periodicita}`;
}

/** Nel golden del motore 1.x l'esito "esente" era implicito. */
function esitoPrima(e: GoldenEntry): string {
  if (e.esito === 'ERRORE') return 'ERRORE';
  if (e.esitoCalcolo) return e.esitoCalcolo;
  if ((e.esenzioni ?? []).some((x) => x.tipo === 'TOTALE')) return 'ESENTE';
  return (e.importoBase ?? 0) === 0 ? 'ZERO' : 'CALCOLATO';
}

function stessiImporti(a: GoldenEntry, b: GoldenEntry): boolean {
  return (
    a.importoBase === b.importoBase &&
    (a.importoRidotto ?? null) === (b.importoRidotto ?? null) &&
    JSON.stringify((a.esenzioni ?? []).map((x) => [x.tipo, x.percentualeRiduzione])) ===
      JSON.stringify((b.esenzioni ?? []).map((x) => [x.tipo, x.percentualeRiduzione]))
  );
}

function classifica(prima: GoldenEntry, dopo: GoldenEntry): Categoria {
  const ep = esitoPrima(prima);
  const ed = dopo.esito === 'ERRORE' ? 'ERRORE' : dopo.esitoCalcolo;

  if (ed === 'NON_CALCOLABILE') {
    if (ep === 'ZERO') return 'ZERO -> NON_CALCOLABILE';
    if (ep === 'ERRORE') return 'ERRORE -> NON_CALCOLABILE';
    if (ep === 'CALCOLATO') return 'IMPORTO -> NON_CALCOLABILE';
    if (ep === 'NON_CALCOLABILE') return 'INVARIATO';
    return 'ALTRO';
  }
  if (ep === 'ESENTE' && ed === 'CALCOLATO') return 'ESENTE -> CALCOLATO';
  if (stessiImporti(prima, dopo)) return 'INVARIATO';
  return 'IMPORTO CAMBIATO';
}

function descrivi(e: GoldenEntry): string {
  if (e.esito === 'ERRORE') return `ERRORE (${e.errore})`;
  if (e.esitoCalcolo === 'NON_CALCOLABILE') {
    return `NON_CALCOLABILE: ${(e.motivi ?? [])
      .map((m) => (m.campo ? `${m.codice}(${m.campo})` : m.codice))
      .join(', ')}`;
  }
  const esenzioni = (e.esenzioni ?? [])
    .map((x) => `${x.tipo}${x.percentualeRiduzione ? ` ${x.percentualeRiduzione}%` : ''}`)
    .join('+');
  return `${e.importoBase}${esenzioni ? ` [${esenzioni}]` : ''}`;
}

function main() {
  const [filePrima, fileDopo] = process.argv.slice(2);
  if (!filePrima || !fileDopo) {
    console.error('Uso: confronta-golden.ts <golden-prima.json> <golden-dopo.json>');
    process.exit(2);
  }

  const prima: GoldenFixture = JSON.parse(readFileSync(filePrima, 'utf-8'));
  const dopo: GoldenFixture = JSON.parse(readFileSync(fileDopo, 'utf-8'));
  const corpus: CorpusFixture = JSON.parse(
    readFileSync(join(__dirname, '../golden/fixtures/veicoli.corpus.json'), 'utf-8'),
  );

  // Peso di ciascuna voce: quanti veicoli reali rappresenta.
  const occorrenze = new Map<string, number>();
  for (const v of corpus.reali) {
    occorrenze.set(v.targa, (v as unknown as { occorrenze?: number }).occorrenze ?? 1);
  }
  const reale = (targa: string) => occorrenze.has(targa);

  const mappaPrima = new Map(prima.risultati.map((e) => [chiave(e), e]));
  const perCategoria = new Map<Categoria, Array<{ prima: GoldenEntry; dopo: GoldenEntry }>>();
  const mancanti: string[] = [];

  for (const d of dopo.risultati) {
    const p = mappaPrima.get(chiave(d));
    if (!p) {
      mancanti.push(chiave(d));
      continue;
    }
    const c = classifica(p, d);
    if (!perCategoria.has(c)) perCategoria.set(c, []);
    perCategoria.get(c)!.push({ prima: p, dopo: d });
  }

  console.log(`Confronto: ${prima.risultati.length} voci prima, ${dopo.risultati.length} dopo`);
  console.log(`Versione motore: ${prima.versioneMotore ?? '1.x'} -> ${dopo.versioneMotore ?? '1.x'}\n`);

  console.log('=== RIEPILOGO PER CATEGORIA ===');
  console.log('  categoria                          voci   di cui veicoli reali (pesati)');
  for (const [c, voci] of [...perCategoria.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const pesati = voci
      .filter((v) => reale(v.dopo.targa) && v.dopo.periodicita === 'ANNUALE')
      .reduce((s, v) => s + (occorrenze.get(v.dopo.targa) ?? 0), 0);
    console.log(`  ${c.padEnd(34)} ${String(voci.length).padStart(4)}   ${pesati}`);
  }
  if (mancanti.length) console.log(`  voci nuove senza corrispondenza: ${mancanti.length}`);

  const assunzioniNuove = dopo.risultati.filter((e) => (e.assunzioni ?? []).length > 0).length;
  console.log(`\n  voci con assunzioni dichiarate: ${assunzioniNuove} (testo aggiuntivo, importo invariato)`);

  // Dettaglio delle categorie che spostano un importo o un esito.
  for (const c of [
    'IMPORTO CAMBIATO',
    'ESENTE -> CALCOLATO',
    'IMPORTO -> NON_CALCOLABILE',
    'ERRORE -> NON_CALCOLABILE',
    'ALTRO',
  ] as Categoria[]) {
    const voci = perCategoria.get(c);
    if (!voci?.length) continue;
    console.log(`\n=== ${c} (${voci.length}) ===`);
    for (const { prima: p, dopo: d } of voci.sort((a, b) => chiave(a.dopo).localeCompare(chiave(b.dopo)))) {
      console.log(`  ${d.periodicita[0]} ${d.targa.padEnd(28)} ${descrivi(p)}`);
      console.log(`    ${''.padEnd(28)} -> ${descrivi(d)}`);
    }
  }

  // Motivi di non calcolabilità sui veicoli reali, pesati.
  const zeroNc = (perCategoria.get('ZERO -> NON_CALCOLABILE') ?? []).filter(
    (v) => reale(v.dopo.targa) && v.dopo.periodicita === 'ANNUALE',
  );
  if (zeroNc.length) {
    const motivi = new Map<string, number>();
    for (const { dopo: d } of zeroNc) {
      for (const m of d.motivi ?? []) {
        const k = m.campo ? `${m.codice}(${m.campo})` : m.codice;
        motivi.set(k, (motivi.get(k) ?? 0) + (occorrenze.get(d.targa) ?? 1));
      }
    }
    console.log('\n=== VEICOLI REALI: DA ZERO A NON_CALCOLABILE, PER MOTIVO ===');
    for (const [m, n] of [...motivi.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(5)}x  ${m}`);
    }
  }

  const cambiati = perCategoria.get('IMPORTO CAMBIATO')?.length ?? 0;
  if (cambiati > 0) {
    console.log(`\nATTENZIONE: ${cambiati} importi calcolati sono cambiati. Vanno giustificati uno per uno.`);
    process.exit(1);
  }
}

main();
