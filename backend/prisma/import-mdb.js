/**
 * Script di importazione dati da database Access (MDB) a Sissibol
 *
 * Utilizzo:
 * 1. Esportare le tabelle MDB in CSV (già fatto in ../import/csv/)
 * 2. Eseguire: npx ts-node prisma/import-mdb.ts
 *
 * Tabelle importate:
 * - Ditte → clienti
 * - Mezzi → veicoli
 * - Scadenziario → scadenze + pagamenti
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Enums (copiati da Prisma per evitare problemi di import)
const TipoCliente = {
  PERSONA_FISICA: 'PERSONA_FISICA',
  PERSONA_GIURIDICA: 'PERSONA_GIURIDICA'
};

const Periodicita = {
  QUADRIMESTRALE: 'QUADRIMESTRALE',
  ANNUALE: 'ANNUALE'
};

const StatoScadenza = {
  DA_PAGARE: 'DA_PAGARE',
  PAGATO: 'PAGATO',
  SCADUTO: 'SCADUTO'
};

// Path ai file CSV (in Docker: /app/import/csv, in locale: ../../import/csv)
const CSV_DIR = process.env.NODE_ENV === 'production'
  ? '/app/import/csv'
  : path.join(__dirname, '../../import/csv');

// =====================================================
// UTILITIES
// =====================================================

function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] || '';
    });
    records.push(record);
  }

  return records;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values;
}

function parseMDBDate(dateStr) {
  if (!dateStr || dateStr === '') return null;

  // Formato MDB: "MM/DD/YY HH:MM:SS" o "MM/DD/YYYY HH:MM:SS"
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);

  // Gestione anno a 2 cifre
  if (year < 100) {
    year = year > 50 ? 1900 + year : 2000 + year;
  }

  return new Date(year, month - 1, day);
}

function parseDecimal(value) {
  if (!value || value === '') return null;
  const num = parseFloat(value.replace(',', '.'));
  return isNaN(num) ? null : num;
}

function parseInt2(value) {
  if (!value || value === '') return null;
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
}

// =====================================================
// LOOKUP TABLES
// =====================================================

function loadLookupTables() {
  const maps = {
    tipoMezzi: new Map(),
    regioni: new Map(),
    marche: new Map(),
  };

  // Tipo Mezzi
  const tipoMezziContent = fs.readFileSync(path.join(CSV_DIR, 'tipo_mezzi.csv'), 'utf-8');
  parseCSV(tipoMezziContent).forEach(row => {
    const cod = parseInt2(row['Cod_tipo_mezzo']);
    if (cod !== null) {
      maps.tipoMezzi.set(cod, row['Tipo_mezzo'] || '');
    }
  });

  // Regioni
  const regioniContent = fs.readFileSync(path.join(CSV_DIR, 'regioni.csv'), 'utf-8');
  parseCSV(regioniContent).forEach(row => {
    const cod = parseInt2(row['Cod_regione']);
    if (cod !== null) {
      maps.regioni.set(cod, row['Regione'] || '');
    }
  });

  // Marche
  const marcheContent = fs.readFileSync(path.join(CSV_DIR, 'marca.csv'), 'utf-8');
  parseCSV(marcheContent).forEach(row => {
    const cod = parseInt2(row['Cod_marca']);
    if (cod !== null) {
      maps.marche.set(cod, row['Marca'] || '');
    }
  });

  console.log(`Lookup tables caricate:`);
  console.log(`  - Tipo mezzi: ${maps.tipoMezzi.size}`);
  console.log(`  - Regioni: ${maps.regioni.size}`);
  console.log(`  - Marche: ${maps.marche.size}`);

  return maps;
}

// =====================================================
// IMPORT DITTE → CLIENTI
// =====================================================

async function importDitte() {
  console.log('\n📁 Importazione Ditte → Clienti...');

  const content = fs.readFileSync(path.join(CSV_DIR, 'ditte.csv'), 'utf-8');
  const records = parseCSV(content);

  // Mappa Cod_ditta MDB → id Sissibol
  const ditteMap = new Map();

  let imported = 0;
  let errors = 0;

  for (const row of records) {
    const codDitta = parseInt2(row['Cod_ditta']);
    if (codDitta === null) continue;

    const ragioneSociale = row['Ditta']?.trim() || `Ditta ${codDitta}`;
    const email = row['Email']?.trim() || null;

    try {
      const cliente = await prisma.cliente.create({
        data: {
          tipoCliente: TipoCliente.PERSONA_GIURIDICA,
          ragioneSociale,
          email,
        },
      });

      ditteMap.set(codDitta, cliente.id);
      imported++;
    } catch (err) {
      console.error(`  Errore ditta ${codDitta} (${ragioneSociale}):`, err.message);
      errors++;
    }
  }

  console.log(`  ✓ Importati: ${imported} clienti`);
  if (errors > 0) console.log(`  ✗ Errori: ${errors}`);

  return ditteMap;
}

// =====================================================
// IMPORT MEZZI → VEICOLI
// =====================================================

async function importMezzi(ditteMap, lookups) {
  console.log('\n🚗 Importazione Mezzi → Veicoli...');

  const content = fs.readFileSync(path.join(CSV_DIR, 'mezzi.csv'), 'utf-8');
  const records = parseCSV(content);

  // Mappa Targa → id Veicolo Sissibol
  const veicoliMap = new Map();

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of records) {
    const targa = row['Targa']?.trim().toUpperCase();
    if (!targa) {
      skipped++;
      continue;
    }

    const codDitta = parseInt2(row['Ditta']);
    const idCliente = codDitta !== null ? ditteMap.get(codDitta) : null;

    if (!idCliente) {
      console.warn(`  ⚠ Veicolo ${targa}: ditta ${codDitta} non trovata, skip`);
      skipped++;
      continue;
    }

    // Mapping tipo veicolo
    const codTipo = parseInt2(row['Tipo']);
    let tipoVeicolo = codTipo !== null ? lookups.tipoMezzi.get(codTipo) : null;

    // Normalizza tipo veicolo per Sissibol
    if (tipoVeicolo) {
      tipoVeicolo = normalizeTipoVeicolo(tipoVeicolo);
    }

    // Mapping regione
    const codRegione = parseInt2(row['Regione']);
    const regione = codRegione !== null ? lookups.regioni.get(codRegione) : null;

    // Altri campi
    const kw = parseDecimal(row['KW']);
    const numAssi = parseInt2(row['NumAssi']);
    const sospPneum = parseInt2(row['SospPneum']);
    const dataImm = parseMDBDate(row['Data_Immatricolazione']);

    try {
      const veicolo = await prisma.veicolo.create({
        data: {
          idCliente,
          targa,
          tipoVeicolo,
          regione,
          potenzaKw: kw,
          numeroAssi: numAssi && numAssi > 0 ? numAssi : null,
          tipoSospensione: sospPneum === 1 ? 'Pneumatiche' : (sospPneum === 0 && numAssi && numAssi > 0 ? 'Non pneumatiche' : null),
          dataImmatricolazione: dataImm,
        },
      });

      veicoliMap.set(targa, veicolo.id);
      imported++;
    } catch (err) {
      console.error(`  Errore veicolo ${targa}:`, err.message);
      errors++;
    }
  }

  console.log(`  ✓ Importati: ${imported} veicoli`);
  console.log(`  ⊘ Saltati: ${skipped}`);
  if (errors > 0) console.log(`  ✗ Errori: ${errors}`);

  return veicoliMap;
}

function normalizeTipoVeicolo(tipo) {
  const map = {
    'Trattore': 'Trattore stradale',
    'Motrice': 'Motrice',
    'Autocarro': 'Autocarro',
    'Auto': 'Autovettura',
    'Furgone': 'Autocarro',
    'motociclo': 'Motociclo',
    'AUTOVEICOLO': 'Autovettura',
    'CISTERNA': 'Autocarro',
    'BETONIERA': 'Autocarro',
    'targa prova': 'Altro',
  };

  return map[tipo] || tipo;
}

// =====================================================
// IMPORT SCADENZIARIO → SCADENZE + PAGAMENTI
// =====================================================

async function importScadenziario(veicoliMap) {
  console.log('\n📅 Importazione Scadenziario → Scadenze + Pagamenti...');

  const content = fs.readFileSync(path.join(CSV_DIR, 'scadenziario.csv'), 'utf-8');
  const records = parseCSV(content);

  let scadenzeImported = 0;
  let pagamentiImported = 0;
  let skipped = 0;
  let errors = 0;

  // Prima analisi: conta scadenze per veicolo per anno per determinare periodicità
  // Se un veicolo ha 3+ scadenze nello stesso anno, è QUADRIMESTRALE
  const scadenzePerVeicoloAnno = new Map();

  for (const row of records) {
    const targa = row['Targa']?.trim().toUpperCase();
    if (!targa) continue;

    const dataScadenza = parseMDBDate(row['Scadenza']);
    if (!dataScadenza) continue;

    const annoScadenza = dataScadenza.getFullYear();
    const key = `${targa}-${annoScadenza}`;

    scadenzePerVeicoloAnno.set(key, (scadenzePerVeicoloAnno.get(key) || 0) + 1);
  }

  // Determina veicoli quadrimestrali (3+ scadenze/anno)
  const veicoliQuadrimestrali = new Set();
  for (const [key, count] of scadenzePerVeicoloAnno.entries()) {
    if (count >= 3) {
      const targa = key.split('-')[0];
      veicoliQuadrimestrali.add(targa);
    }
  }

  console.log(`  Veicoli con periodicità QUADRIMESTRALE rilevati: ${veicoliQuadrimestrali.size}`);

  // Raggruppa per targa per evitare duplicati di scadenza stesso mese/anno
  const scadenzeCreate = new Map();

  for (const row of records) {
    const targa = row['Targa']?.trim().toUpperCase();
    if (!targa) {
      skipped++;
      continue;
    }

    const idVeicolo = veicoliMap.get(targa);
    if (!idVeicolo) {
      // Veicolo non importato, skip silenzioso
      skipped++;
      continue;
    }

    const dataScadenza = parseMDBDate(row['Scadenza']);
    if (!dataScadenza) {
      skipped++;
      continue;
    }

    const meseScadenza = dataScadenza.getMonth() + 1;
    const annoScadenza = dataScadenza.getFullYear();

    const importoPrevisto = parseDecimal(row['Bollo']);
    const dataPagamento = parseMDBDate(row['Data_pagamento']);

    const key = `${targa}-${annoScadenza}-${meseScadenza}`;

    if (!scadenzeCreate.has(key)) {
      scadenzeCreate.set(key, []);
    }

    scadenzeCreate.get(key).push({
      idVeicolo,
      targa, // Aggiungiamo la targa per determinare la periodicità
      meseScadenza,
      annoScadenza,
      importoPrevisto,
      dataPagamento,
      importoPagato: dataPagamento ? importoPrevisto : null,
    });
  }

  console.log(`  Elaborazione ${scadenzeCreate.size} scadenze uniche...`);

  // Batch insert per performance
  const BATCH_SIZE = 500;
  const entries = Array.from(scadenzeCreate.entries());

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    for (const [key, items] of batch) {
      const first = items[0];
      const hasPagamento = items.some(item => item.dataPagamento !== null);

      try {
        // Determina lo stato
        const now = new Date();
        const scadenzaDate = new Date(first.annoScadenza, first.meseScadenza - 1, 1);
        let stato;

        if (hasPagamento) {
          stato = StatoScadenza.PAGATO;
        } else if (scadenzaDate < now) {
          stato = StatoScadenza.SCADUTO;
        } else {
          stato = StatoScadenza.DA_PAGARE;
        }

        // Determina periodicità basata sull'analisi delle scadenze
        const periodicita = veicoliQuadrimestrali.has(first.targa)
          ? Periodicita.QUADRIMESTRALE
          : Periodicita.ANNUALE;

        // Crea scadenza
        const scadenza = await prisma.scadenza.create({
          data: {
            idVeicolo: first.idVeicolo,
            meseScadenza: first.meseScadenza,
            annoScadenza: first.annoScadenza,
            periodicita,
            importoPrevisto: first.importoPrevisto,
            stato,
          },
        });

        scadenzeImported++;

        // Crea pagamento se presente
        if (hasPagamento) {
          const paidItem = items.find(item => item.dataPagamento !== null);

          await prisma.pagamento.create({
            data: {
              idScadenza: scadenza.id,
              dataPagamento: paidItem.dataPagamento,
              importoPagato: paidItem.importoPagato || paidItem.importoPrevisto || 0,
              metodoPagamento: 'Importato da archivio',
            },
          });

          pagamentiImported++;
        }
      } catch (err) {
        errors++;
        if (errors <= 10) {
          console.error(`  Errore scadenza ${key}:`, err.message);
        }
      }
    }

    // Progress
    const progress = Math.min(i + BATCH_SIZE, entries.length);
    process.stdout.write(`\r  Progresso: ${progress}/${entries.length} (${Math.round(progress/entries.length*100)}%)`);
  }

  console.log(''); // newline after progress
  console.log(`  ✓ Scadenze importate: ${scadenzeImported}`);
  console.log(`  ✓ Pagamenti importati: ${pagamentiImported}`);
  console.log(`  ⊘ Saltati: ${skipped}`);
  if (errors > 0) console.log(`  ✗ Errori: ${errors}`);
}

// =====================================================
// MAIN
// =====================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     SISSIBOL - Import Database MDB (Scadenziario Bolli)    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();

  try {
    // Verifica che i CSV esistano
    if (!fs.existsSync(CSV_DIR)) {
      throw new Error(`Directory CSV non trovata: ${CSV_DIR}`);
    }

    const requiredFiles = ['ditte.csv', 'mezzi.csv', 'scadenziario.csv', 'tipo_mezzi.csv', 'regioni.csv', 'marca.csv'];
    for (const file of requiredFiles) {
      if (!fs.existsSync(path.join(CSV_DIR, file))) {
        throw new Error(`File CSV mancante: ${file}`);
      }
    }

    // Carica lookup tables
    const lookups = loadLookupTables();

    // Import in ordine (rispettando le FK)
    const ditteMap = await importDitte();
    const veicoliMap = await importMezzi(ditteMap, lookups);
    await importScadenziario(veicoliMap);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Import completato in ${elapsed}s`);

  } catch (err) {
    console.error('\n❌ Errore durante l\'import:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
