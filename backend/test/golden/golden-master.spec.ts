/**
 * GOLDEN MASTER del motore di calcolo bollo.
 *
 * Rifà il calcolo su tutto il corpus e lo confronta con gli importi registrati
 * in `fixtures/bollo.golden.json`. Serve a rendere impossibile cambiare un
 * importo per sbaglio durante un refactor: qualunque differenza fa fallire il
 * test e viene elencata veicolo per veicolo.
 *
 * Il golden master fotografa il comportamento ATTUALE, non quello corretto.
 * Quando una correzione cambia un importo di proposito, si rigenera il fixture
 *
 *     npx ts-node test/tools/generate-golden.ts
 *
 * e si rivede il diff: è lì che si vede esattamente cosa la correzione ha
 * spostato, e su quanti veicoli.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { computeGolden, costruisciRiepilogo } from './compute';
import { GOLDEN_REFERENCE_DATE } from '../helpers/frozen-time';
import type {
  CorpusFixture,
  GoldenEntry,
  GoldenFixture,
  TariffarioFixture,
} from './tariffario.types';

const FIXTURES = join(__dirname, 'fixtures');

function leggi<T>(nome: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, nome), 'utf-8')) as T;
}

const tariffario = leggi<TariffarioFixture>('tariffario.json');
const corpus = leggi<CorpusFixture>('veicoli.corpus.json');
const atteso = leggi<GoldenFixture>('bollo.golden.json');

/** Chiave che identifica una voce del golden master. */
function chiave(e: GoldenEntry): string {
  return `${e.targa}|${e.anno}|${e.periodicita}`;
}

/** Riassume una voce in una riga leggibile nel messaggio di errore. */
function descrivi(e: GoldenEntry | undefined): string {
  if (!e) return '(assente)';
  if (e.esito === 'ERRORE') return `ERRORE: ${e.errore}`;
  const esenzioni = (e.esenzioni ?? [])
    .map((x) => `${x.tipo}${x.percentualeRiduzione ? ` ${x.percentualeRiduzione}%` : ''}`)
    .join('+');
  return [
    `base=${e.importoBase}`,
    `ridotto=${e.importoRidotto}`,
    esenzioni ? `esenzioni=${esenzioni}` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

describe('Golden master - motore di calcolo bollo', () => {
  let effettivo: GoldenFixture;

  beforeAll(async () => {
    effettivo = await computeGolden(corpus, tariffario, atteso.dataRiferimento);
  });

  it('il fixture è stato generato con la data di riferimento corrente', () => {
    // Se la costante cambia senza rigenerare i fixture, gli importi delle
    // esenzioni legate all'anzianità slitterebbero senza spiegazione.
    expect(atteso.dataRiferimento).toBe(GOLDEN_REFERENCE_DATE);
  });

  it('copre lo stesso insieme di veicoli registrato nel fixture', () => {
    const chiaviAttese = atteso.risultati.map(chiave).sort();
    const chiaviEffettive = effettivo.risultati.map(chiave).sort();

    const mancanti = chiaviAttese.filter((k) => !chiaviEffettive.includes(k));
    const inPiu = chiaviEffettive.filter((k) => !chiaviAttese.includes(k));

    expect({ mancanti: mancanti.slice(0, 20), inPiu: inPiu.slice(0, 20) }).toEqual({
      mancanti: [],
      inPiu: [],
    });
  });

  it('produce esattamente gli importi registrati nel fixture', () => {
    const attesiPerChiave = new Map(atteso.risultati.map((e) => [chiave(e), e]));
    const divergenze: string[] = [];

    for (const e of effettivo.risultati) {
      const rif = attesiPerChiave.get(chiave(e));
      if (!rif) continue; // gestito dal test sulla copertura

      // Il confronto è sull'intera voce: importi, esenzioni, tariffe applicate,
      // note e dettaglio. Anche un cambio di sola descrizione va visto.
      if (JSON.stringify(e) !== JSON.stringify(rif)) {
        divergenze.push(
          `  ${chiave(e)}\n      atteso:    ${descrivi(rif)}\n      ottenuto:  ${descrivi(e)}`,
        );
      }
    }

    if (divergenze.length > 0) {
      const mostrate = divergenze.slice(0, 25);
      const extra =
        divergenze.length > mostrate.length
          ? `\n  ... e altre ${divergenze.length - mostrate.length} divergenze`
          : '';
      throw new Error(
        `Il motore di calcolo ha prodotto ${divergenze.length} risultati diversi dal golden master.\n` +
          `Se il cambiamento è voluto, rigenera il fixture con:\n` +
          `  npx ts-node test/tools/generate-golden.ts\n` +
          `e verifica il diff prima di committarlo.\n\n` +
          mostrate.join('\n') +
          extra,
      );
    }
  });

  it('mantiene invariata la distribuzione degli esiti', () => {
    // Controllo aggregato: rende evidente nel diff della PR se un refactor ha
    // spostato veicoli fra le categorie (calcolati, a zero, in errore).
    expect(costruisciRiepilogo(effettivo.risultati)).toEqual(atteso.riepilogo);
  });

  it('il calcolo è deterministico a parità di data di riferimento', async () => {
    const seconda = await computeGolden(corpus, tariffario, atteso.dataRiferimento);
    expect(seconda.risultati).toEqual(effettivo.risultati);
  });
});

describe('Golden master - copertura del corpus', () => {
  it('include i veicoli reali deduplicati e i casi sintetici', () => {
    expect(corpus.reali.length).toBeGreaterThan(200);
    expect(corpus.sintetici.length).toBeGreaterThan(50);
  });

  it('i casi sintetici coprono tutti i rami del motore di calcolo', () => {
    // Ogni tipo gestito esplicitamente da `calcolaImportoPerTipo` deve avere
    // almeno un caso, altrimenti un refactor può romperlo in silenzio.
    const tipiCoperti = new Set(
      corpus.sintetici.map((v) => v.tipoVeicolo).filter(Boolean),
    );

    const tipiAttesi = [
      'Autovettura',
      'Autoveicolo uso promiscuo',
      'Motociclo',
      'Autocarro',
      'Autotreno',
      'Autoarticolato',
      'Trattore stradale',
      'Autobus',
      'Autoveicolo speciale',
      'Autocaravan',
      'Motocarro',
      'Motofurgone',
      'Rimorchio',
      'Rimorchio speciale',
      'Semirimorchio',
      'Rimorchio trasporto persone',
    ];

    expect(tipiAttesi.filter((t) => !tipiCoperti.has(t))).toEqual([]);
  });

  it('i casi sintetici coprono le esenzioni configurate', () => {
    const alimentazioni = new Set(
      corpus.sintetici.map((v) => v.alimentazione).filter(Boolean),
    );
    expect(alimentazioni.has('Elettrico')).toBe(true);
    expect(alimentazioni.has('GPL')).toBe(true);
    expect(alimentazioni.has('Metano')).toBe(true);

    // Almeno un veicolo oltre la soglia dei 30 anni
    const conDataVecchia = corpus.sintetici.filter(
      (v) => v.dataImmatricolazione && v.dataImmatricolazione < '1997-01-01',
    );
    expect(conDataVecchia.length).toBeGreaterThan(0);
  });
});
