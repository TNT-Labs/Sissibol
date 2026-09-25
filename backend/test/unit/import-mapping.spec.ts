/**
 * Test delle funzioni pure di import da archivio Access.
 *
 * L'import è l'unico punto in cui i dati storici entrano nel sistema: un bug
 * qui si propaga silenziosamente su tutto lo scadenziario. Fino ad ora queste
 * funzioni vivevano dentro lo script `import-mdb.js` e non erano testabili.
 *
 * Come il golden master, questi test fissano il comportamento ATTUALE,
 * comprese le scelte discutibili (segnalate nei commenti).
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const mapping = require('../../prisma/import-mapping');

describe('parseCSVLine', () => {
  it('separa i campi sulla virgola', () => {
    expect(mapping.parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('non separa sulle virgole dentro le virgolette', () => {
    expect(mapping.parseCSVLine('1,"Rossi, Mario",3')).toEqual([
      '1',
      'Rossi, Mario',
      '3',
    ]);
  });

  it('interpreta le virgolette raddoppiate come virgoletta letterale', () => {
    expect(mapping.parseCSVLine('"dice ""ciao""",x')).toEqual([
      'dice "ciao"',
      'x',
    ]);
  });

  it('conserva i campi vuoti in coda', () => {
    expect(mapping.parseCSVLine('a,,')).toEqual(['a', '', '']);
  });

  it('rimuove gli spazi ai bordi dei campi', () => {
    expect(mapping.parseCSVLine(' a , b ')).toEqual(['a', 'b']);
  });
});

describe('parseCSV', () => {
  it('usa la prima riga come intestazione', () => {
    const csv = 'Targa,KW\n"AB123CD",85\n"EF456GH",110';
    expect(mapping.parseCSV(csv)).toEqual([
      { Targa: 'AB123CD', KW: '85' },
      { Targa: 'EF456GH', KW: '110' },
    ]);
  });

  it('salta le righe vuote', () => {
    const csv = 'A,B\n1,2\n\n3,4\n';
    expect(mapping.parseCSV(csv)).toHaveLength(2);
  });

  it('restituisce un array vuoto per contenuto vuoto', () => {
    expect(mapping.parseCSV('')).toEqual([]);
  });

  it('normalizza a stringa vuota le colonne mancanti nella riga', () => {
    const csv = 'A,B,C\n1,2';
    expect(mapping.parseCSV(csv)).toEqual([{ A: '1', B: '2', C: '' }]);
  });
});

describe('parseMDBDate', () => {
  it('interpreta il formato Access MM/DD/YY', () => {
    const d = mapping.parseMDBDate('10/31/17 00:00:00');
    expect(d.toISOString()).toBe('2017-10-31T00:00:00.000Z');
  });

  it('interpreta anche gli anni a 4 cifre', () => {
    const d = mapping.parseMDBDate('03/05/2021 00:00:00');
    expect(d.toISOString()).toBe('2021-03-05T00:00:00.000Z');
  });

  it('usa il 1950 come perno per gli anni a 2 cifre', () => {
    // Regola attuale: anno > 50 -> 1900+anno, altrimenti 2000+anno.
    expect(mapping.parseMDBDate('01/01/51').getUTCFullYear()).toBe(1951);
    expect(mapping.parseMDBDate('01/01/50').getUTCFullYear()).toBe(2050);
    expect(mapping.parseMDBDate('01/01/49').getUTCFullYear()).toBe(2049);
  });

  it('restituisce null su valori vuoti o non riconosciuti', () => {
    expect(mapping.parseMDBDate('')).toBeNull();
    expect(mapping.parseMDBDate(null)).toBeNull();
    expect(mapping.parseMDBDate('non una data')).toBeNull();
  });

  it('accetta il 29 febbraio degli anni bisestili', () => {
    const d = mapping.parseMDBDate('02/29/16');
    expect(d.toISOString()).toBe('2016-02-29T00:00:00.000Z');
  });

  it('normalizza a mezzanotte UTC, non a mezzanotte locale', () => {
    // Le date finiscono in colonne DATE: costruirle nel fuso locale le
    // farebbe slittare di un giorno sui server con offset positivo, e il
    // difetto sarebbe invisibile su un container UTC.
    const d = mapping.parseMDBDate('01/01/2020');
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getTime()).toBe(Date.UTC(2020, 0, 1));
  });
});

describe('parseDecimal', () => {
  it('legge i numeri con il punto decimale', () => {
    expect(mapping.parseDecimal('379.09')).toBe(379.09);
  });

  it('accetta anche la virgola come separatore decimale', () => {
    expect(mapping.parseDecimal('379,09')).toBe(379.09);
  });

  it('restituisce null su vuoto o non numerico', () => {
    expect(mapping.parseDecimal('')).toBeNull();
    expect(mapping.parseDecimal(null)).toBeNull();
    expect(mapping.parseDecimal('abc')).toBeNull();
  });

  it('tratta lo zero testuale come null', () => {
    // Conseguenza del controllo di verità su stringa: '0' è vero, 0 no.
    // Documentato perché è una fonte di sorprese, non perché sia desiderabile.
    expect(mapping.parseDecimal('0')).toBe(0);
    expect(mapping.parseDecimal(0)).toBeNull();
  });
});

describe('parseInt2', () => {
  it('legge gli interi', () => {
    expect(mapping.parseInt2('42')).toBe(42);
  });

  it('tronca i decimali', () => {
    expect(mapping.parseInt2('42.9')).toBe(42);
  });

  it('restituisce null su vuoto o non numerico', () => {
    expect(mapping.parseInt2('')).toBeNull();
    expect(mapping.parseInt2(null)).toBeNull();
    expect(mapping.parseInt2('abc')).toBeNull();
  });
});

describe('normalizeTipoVeicolo', () => {
  it.each([
    ['Trattore', 'Trattore stradale'],
    ['Auto', 'Autovettura'],
    ['AUTOVEICOLO', 'Autovettura'],
    ['Furgone', 'Autocarro'],
    ['CISTERNA', 'Autocarro'],
    ['BETONIERA', 'Autocarro'],
    ['motociclo', 'Motociclo'],
    ['Autocarro', 'Autocarro'],
    ['targa prova', 'Altro'],
  ])('mappa %s su %s', (input, atteso) => {
    expect(mapping.normalizeTipoVeicolo(input)).toBe(atteso);
  });

  it('lascia invariati i tipi non mappati', () => {
    expect(mapping.normalizeTipoVeicolo('Sconosciuto')).toBe('Sconosciuto');
  });

  it('produce "Motrice", che il tariffario non conosce', () => {
    // Comportamento attuale da correggere in fase di bonifica del dominio:
    // nessuna tariffa è definita per "Motrice", quindi questi veicoli
    // ricadono sul calcolo generico per KW.
    expect(mapping.normalizeTipoVeicolo('Motrice')).toBe('Motrice');
  });
});

describe('mapPeriodicita', () => {
  it('mappa 4 su QUADRIMESTRALE', () => {
    expect(mapping.mapPeriodicita(4)).toBe('QUADRIMESTRALE');
  });

  it('mappa 12 su ANNUALE', () => {
    expect(mapping.mapPeriodicita(12)).toBe('ANNUALE');
  });

  it('fa ricadere su ANNUALE qualsiasi altro valore', () => {
    // L'archivio contiene valori anomali (0, 14, 137, 138, 139) che oggi
    // diventano tutti ANNUALE senza segnalazione.
    for (const v of [0, 14, 137, 138, 139, null, undefined]) {
      expect(mapping.mapPeriodicita(v)).toBe('ANNUALE');
    }
  });
});

describe('readPeriodicitaRaw', () => {
  it('legge la colonna con accento presente negli export Access', () => {
    expect(mapping.readPeriodicitaRaw({ Periodicità: '4' })).toBe(4);
  });

  it('accetta le varianti senza accento', () => {
    expect(mapping.readPeriodicitaRaw({ Periodicita: '12' })).toBe(12);
    expect(mapping.readPeriodicitaRaw({ periodicita: '12' })).toBe(12);
  });

  it('restituisce null se la colonna manca', () => {
    expect(mapping.readPeriodicitaRaw({})).toBeNull();
  });
});

describe('mapTipoSospensione', () => {
  it('mappa il flag 1 su Pneumatiche', () => {
    expect(mapping.mapTipoSospensione(1, 3)).toBe('Pneumatiche');
    // Il flag vale anche senza numero assi
    expect(mapping.mapTipoSospensione(1, null)).toBe('Pneumatiche');
  });

  it('mappa il flag 0 su Non pneumatiche solo se ci sono assi', () => {
    expect(mapping.mapTipoSospensione(0, 3)).toBe('Non pneumatiche');
    expect(mapping.mapTipoSospensione(0, 0)).toBeNull();
    expect(mapping.mapTipoSospensione(0, null)).toBeNull();
  });

  it('restituisce null se il flag non è valorizzato', () => {
    expect(mapping.mapTipoSospensione(null, 3)).toBeNull();
  });
});

describe('mapNumeroAssi', () => {
  it('conserva i valori positivi', () => {
    expect(mapping.mapNumeroAssi(3)).toBe(3);
  });

  it('tratta 0 e null come non specificato', () => {
    // Nell'archivio 0 significa "non rilevato", non "zero assi".
    expect(mapping.mapNumeroAssi(0)).toBeNull();
    expect(mapping.mapNumeroAssi(null)).toBeNull();
  });
});

describe('importoPrevistoDaArchivio', () => {
  it('rende mancante il segnaposto di 1 euro sulle scadenze non pagate', () => {
    // Nessun bollo reale vale 1 euro: conservarlo lo faceva sembrare un
    // importo valido, e il pagamento multiplo avrebbe pagato 1 euro.
    expect(mapping.importoPrevistoDaArchivio(1, false)).toBeNull();
  });

  it('conserva il segnaposto sulle scadenze pagate', () => {
    // Accompagna un pagamento effettivamente registrato: è un fatto storico.
    expect(mapping.importoPrevistoDaArchivio(1, true)).toBe(1);
  });

  it('conserva gli importi reali', () => {
    expect(mapping.importoPrevistoDaArchivio(233.1, false)).toBe(233.1);
    expect(mapping.importoPrevistoDaArchivio(20.98, false)).toBe(20.98);
    expect(mapping.importoPrevistoDaArchivio(233.1, true)).toBe(233.1);
  });

  it('lascia mancante un importo mancante', () => {
    expect(mapping.importoPrevistoDaArchivio(null, false)).toBeNull();
    expect(mapping.importoPrevistoDaArchivio(undefined, true)).toBeNull();
  });

  it('usa lo stesso segnaposto della migrazione', () => {
    expect(mapping.IMPORTO_SEGNAPOSTO_ARCHIVIO).toBe(1);
  });
});
