/**
 * Funzioni pure di parsing e mapping usate dall'import da Access (MDB).
 *
 * Estratte da `import-mdb.js` senza modifiche di comportamento, per poter
 * essere testate e riusate dagli strumenti di test (costruzione del corpus
 * golden master) senza toccare il database.
 */

// Enums (copiati da Prisma per evitare problemi di import)
const TipoCliente = {
  PERSONA_FISICA: 'PERSONA_FISICA',
  PERSONA_GIURIDICA: 'PERSONA_GIURIDICA',
};

const Periodicita = {
  QUADRIMESTRALE: 'QUADRIMESTRALE',
  ANNUALE: 'ANNUALE',
};

const StatoScadenza = {
  DA_PAGARE: 'DA_PAGARE',
  PAGATO: 'PAGATO',
  SCADUTO: 'SCADUTO',
};

// =====================================================
// PARSING CSV
// =====================================================

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

function parseCSV(content) {
  const lines = content.split('\n').filter((line) => line.trim());
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

  // Mezzanotte UTC, non mezzanotte locale.
  //
  // Le date dell'archivio finiscono tutte in colonne di tipo DATE (scadenza,
  // pagamento, immatricolazione), dove conta il giorno e non l'istante.
  // Costruendole nel fuso locale, su un server con offset positivo
  // (per esempio Europe/Rome) mezzanotte locale e' il giorno PRECEDENTE in
  // UTC, e la data veniva salvata con un giorno di scarto. Il problema non si
  // manifesta su un container UTC, quindi resterebbe invisibile fino alla
  // messa in produzione.
  return new Date(Date.UTC(year, month - 1, day));
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
// MAPPING DOMINIO
// =====================================================

/**
 * Traduce il tipo mezzo dell'archivio Access nel tipo veicolo Sissibol.
 * I valori non mappati vengono restituiti invariati.
 */
function normalizeTipoVeicolo(tipo) {
  const map = {
    Trattore: 'Trattore stradale',
    Motrice: 'Motrice',
    Autocarro: 'Autocarro',
    Auto: 'Autovettura',
    Furgone: 'Autocarro',
    motociclo: 'Motociclo',
    AUTOVEICOLO: 'Autovettura',
    CISTERNA: 'Autocarro',
    BETONIERA: 'Autocarro',
    'targa prova': 'Altro',
  };

  return map[tipo] || tipo;
}

/**
 * Periodicità dal CSV mezzi: 12 = ANNUALE, 4 = QUADRIMESTRALE.
 * Qualsiasi altro valore ricade su ANNUALE.
 */
function mapPeriodicita(periodicitaVal) {
  return periodicitaVal === 4 ? Periodicita.QUADRIMESTRALE : Periodicita.ANNUALE;
}

/**
 * Il flag SospPneum dell'archivio vale solo se il veicolo ha un numero di assi
 * valorizzato; altrimenti il tipo sospensione resta sconosciuto.
 */
function mapTipoSospensione(sospPneum, numAssi) {
  if (sospPneum === 1) return 'Pneumatiche';
  if (sospPneum === 0 && numAssi && numAssi > 0) return 'Non pneumatiche';
  return null;
}

/**
 * Numero assi: l'archivio usa 0 come "non specificato".
 */
function mapNumeroAssi(numAssi) {
  return numAssi && numAssi > 0 ? numAssi : null;
}

/**
 * Grandezza fisica di un veicolo (potenza, cilindrata, portata, peso...).
 *
 * Nell'archivio lo 0 significa "non rilevato", non "zero": nessun veicolo ha
 * davvero 0 KW. Scrivendolo come 0 la lacuna diventava invisibile, perche' una
 * query su IS NULL non la trovava e lo 0 sembrava un valore misurato.
 * Restituire null la rende interrogabile.
 */
function mapGrandezzaFisica(valore) {
  if (valore === null || valore === undefined) return null;
  return valore > 0 ? valore : null;
}

/**
 * Importo con cui l'archivio Access segnava una scadenza di cui non
 * conosceva il bollo. Nessun importo reale dell'archivio è compreso fra 1 e
 * 20,98 euro.
 */
const IMPORTO_SEGNAPOSTO_ARCHIVIO = 1;

/**
 * Importo previsto di una scadenza dell'archivio.
 *
 * Sulle scadenze non pagate il segnaposto diventa null (importo mancante):
 * conservarlo come 1 euro lo faceva sembrare un importo valido, e il
 * pagamento multiplo avrebbe registrato pagamenti da 1 euro. Sulle scadenze
 * pagate resta com'è, perché accompagna un pagamento effettivamente
 * registrato: è un fatto storico.
 *
 * Stessa regola della migrazione 20260926000000_importi_segnaposto_archivio.
 */
function importoPrevistoDaArchivio(importo, pagata) {
  if (importo === null || importo === undefined) return null;
  if (!pagata && importo === IMPORTO_SEGNAPOSTO_ARCHIVIO) return null;
  return importo;
}

/**
 * Legge dalla riga del CSV mezzi il valore di periodicità, tollerando le
 * varianti di intestazione presenti negli export ("Periodicità" con accento).
 */
function readPeriodicitaRaw(row) {
  return (
    parseInt2(row['Periodicità']) ||
    parseInt2(row['Periodicita']) ||
    parseInt2(row['periodicita'])
  );
}

module.exports = {
  TipoCliente,
  Periodicita,
  StatoScadenza,
  parseCSV,
  parseCSVLine,
  parseMDBDate,
  parseDecimal,
  parseInt2,
  normalizeTipoVeicolo,
  mapPeriodicita,
  mapTipoSospensione,
  mapNumeroAssi,
  mapGrandezzaFisica,
  IMPORTO_SEGNAPOSTO_ARCHIVIO,
  importoPrevistoDaArchivio,
  readPeriodicitaRaw,
};
