/**
 * Test del motore di calcolo puro.
 *
 * Il golden master verifica l'ampiezza (tutto il parco veicoli, il tariffario
 * reale); questi test fissano le POLITICHE, una per una, su tariffari minimi
 * costruiti apposta, così che il motivo di un fallimento sia evidente.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  EsenzioneInput,
  TariffaInput,
  TariffarioInput,
  VeicoloInput,
  calcolaBollo,
} from './index';
import { anniCompiuti } from './numeri';

// =====================================================
// COSTRUTTORI DI DATI DI PROVA
// =====================================================

function veicolo(override: Partial<VeicoloInput> = {}): VeicoloInput {
  return {
    tipoVeicolo: 'Autovettura',
    classeAmbientale: 'Euro 6',
    alimentazione: 'Benzina',
    potenzaKw: '85',
    cilindrata: null,
    portataKg: null,
    pesoComplessivoKg: null,
    numeroAssi: null,
    tipoSospensione: null,
    numeroPosti: null,
    massaRimorchiabileKg: null,
    dataImmatricolazione: '2020-03-10',
    ...override,
  };
}

function tariffa(override: Partial<TariffaInput>): TariffaInput {
  return {
    tipoVeicolo: 'Autovettura',
    categoriaEuro: null,
    unitaMisura: 'KW',
    sogliaMin: '0',
    sogliaMax: null,
    importoUnitario: '0',
    importoFisso: null,
    tipoSospensione: null,
    periodicita: 'ANNUALE',
    descrizione: null,
    ...override,
  };
}

const SCAGLIONI_EURO_456: TariffaInput[] = [
  tariffa({ categoriaEuro: 'Euro 4-5-6', sogliaMin: '0', sogliaMax: '100', importoUnitario: '2.58', descrizione: 'fino a 100 KW' }),
  tariffa({ categoriaEuro: 'Euro 4-5-6', sogliaMin: '100', sogliaMax: null, importoUnitario: '3.87', descrizione: 'oltre 100 KW' }),
];

const ESENZIONE_ELETTRICO_TOTALE: EsenzioneInput = {
  id: 1,
  tipoEsenzione: 'TOTALE',
  percentualeRiduzione: null,
  tipoVeicolo: null,
  alimentazione: 'Elettrico',
  anniDaImmatricolazione: 5,
  descrizione: 'Elettrici primi 5 anni',
};
const ESENZIONE_ELETTRICO_PARZIALE: EsenzioneInput = {
  id: 2,
  tipoEsenzione: 'PARZIALE',
  percentualeRiduzione: '75',
  tipoVeicolo: null,
  alimentazione: 'Elettrico',
  anniDaImmatricolazione: null,
  descrizione: 'Elettrici oltre i 5 anni',
};
const ESENZIONE_GPL: EsenzioneInput = {
  id: 3,
  tipoEsenzione: 'PARZIALE',
  percentualeRiduzione: '25',
  tipoVeicolo: null,
  alimentazione: 'GPL',
  anniDaImmatricolazione: null,
  descrizione: 'GPL',
};
const ESENZIONE_STORICO: EsenzioneInput = {
  id: 4,
  tipoEsenzione: 'PARZIALE',
  percentualeRiduzione: '50',
  tipoVeicolo: null,
  alimentazione: null,
  anniDaImmatricolazione: 30,
  descrizione: 'Ultratrentennali',
};

function tariffario(override: Partial<TariffarioInput> = {}): TariffarioInput {
  return {
    id: 1,
    anno: 2026,
    regione: 'Lombardia',
    scontoRid: '15',
    tariffe: SCAGLIONI_EURO_456,
    esenzioni: [],
    ...override,
  };
}

const ANNUALE = { periodicita: 'ANNUALE' as const, dataRiferimento: '2026-06-15' };
const QUADRIMESTRALE = { periodicita: 'QUADRIMESTRALE' as const, dataRiferimento: '2026-06-15' };

// =====================================================
// PUREZZA E DETERMINISMO
// =====================================================

describe('Motore - purezza', () => {
  it('nessun file del motore importa database, framework o altri moduli dell\'applicazione', () => {
    const cartella = __dirname;
    const importVietati: string[] = [];

    for (const file of readdirSync(cartella).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))) {
      const sorgente = readFileSync(join(cartella, file), 'utf-8');
      for (const [, modulo] of sorgente.matchAll(/from\s+'([^']+)'/g)) {
        const ammesso = modulo.startsWith('./') || modulo === 'decimal.js';
        if (!ammesso) importVietati.push(`${file}: ${modulo}`);
      }
    }

    expect(importVietati).toEqual([]);
  });

  it('a parità di input produce sempre lo stesso risultato', () => {
    const a = calcolaBollo(veicolo(), tariffario(), ANNUALE);
    const b = calcolaBollo(veicolo(), tariffario(), ANNUALE);
    expect(a).toEqual(b);
  });

  it('non dipende dall\'orologio di sistema: l\'anzianità usa la data passata', () => {
    const elettrica = veicolo({ alimentazione: 'Elettrico', dataImmatricolazione: '2022-01-01' });
    const t = tariffario({ esenzioni: [ESENZIONE_ELETTRICO_TOTALE, ESENZIONE_ELETTRICO_PARZIALE] });

    expect(calcolaBollo(elettrica, t, { ...ANNUALE, dataRiferimento: '2026-06-15' }).esito).toBe('ESENTE');
    expect(calcolaBollo(elettrica, t, { ...ANNUALE, dataRiferimento: '2027-06-15' }).esito).toBe('CALCOLATO');
  });
});

// =====================================================
// CALCOLO E ARROTONDAMENTI
// =====================================================

describe('Motore - calcolo', () => {
  it('applica gli scaglioni progressivi per KW', () => {
    // 100 x 2.58 + 13 x 3.87 = 258 + 50.31
    const r = calcolaBollo(veicolo({ potenzaKw: '113' }), tariffario(), ANNUALE);
    expect(r.esito).toBe('CALCOLATO');
    expect(r.importo).toBe('308.31');
    expect(r.voci.map((v) => v.importo)).toEqual(['258.00', '50.31']);
  });

  it('applica lo sconto per domiciliazione bancaria', () => {
    // 219.30 - 15% = 186.405 -> 186.41
    const r = calcolaBollo(veicolo(), tariffario(), ANNUALE);
    expect(r.importo).toBe('219.30');
    expect(r.importoRidotto).toBe('186.41');
  });

  it('senza sconto configurato non produce un importo ridotto', () => {
    const r = calcolaBollo(veicolo(), tariffario({ scontoRid: '0' }), ANNUALE);
    expect(r.importoRidotto).toBeNull();
  });

  it('arrotonda al centesimo in aritmetica decimale, non in virgola mobile', () => {
    // 0.5 KW x 2.01 = 1.005: in virgola mobile Math.round(1.005 * 100) / 100
    // dà 1.00, perché 1.005 * 100 = 100.49999999999999. Il valore corretto
    // con arrotondamento commerciale è 1.01.
    const t = tariffario({
      scontoRid: '0',
      tariffe: [tariffa({ tipoVeicolo: 'Autobus', importoUnitario: '2.01' })],
    });
    const r = calcolaBollo(veicolo({ tipoVeicolo: 'Autobus', potenzaKw: '0.5' }), t, ANNUALE);
    expect(r.importo).toBe('1.01');
  });

  it('calcola i motocicli con fisso fino a soglia e poi per KW eccedenti', () => {
    const t = tariffario({
      tariffe: [
        tariffa({ tipoVeicolo: 'Motociclo', categoriaEuro: 'Euro 3 e successivi', sogliaMin: '0', sogliaMax: '11', importoFisso: '20' }),
        tariffa({ tipoVeicolo: 'Motociclo', categoriaEuro: 'Euro 3 e successivi', sogliaMin: '11', importoUnitario: '0.88' }),
      ],
    });
    const moto = (kw: string) =>
      calcolaBollo(veicolo({ tipoVeicolo: 'Motociclo', classeAmbientale: 'Euro 5', potenzaKw: kw }), t, ANNUALE);

    expect(moto('11').importo).toBe('20.00'); // soglia inclusa nella fascia fissa
    expect(moto('35').importo).toBe('41.12'); // 20 + 24 x 0.88
  });

  it('riporta alla categoria "Euro 3 e successivi" tutte le classi recenti dei motocicli', () => {
    const t = tariffario({
      tariffe: [tariffa({ tipoVeicolo: 'Motociclo', categoriaEuro: 'Euro 3 e successivi', importoFisso: '20' })],
    });
    const r = calcolaBollo(
      veicolo({ tipoVeicolo: 'Motociclo', classeAmbientale: 'Euro 6d', potenzaKw: '5' }),
      t,
      ANNUALE,
    );
    expect(r.esito).toBe('CALCOLATO');
  });
});

// =====================================================
// NON CALCOLABILE: MAI UN IMPORTO FITTIZIO
// =====================================================

describe('Motore - non calcolabile', () => {
  it('non restituisce mai zero quando il calcolo non è possibile', () => {
    const r = calcolaBollo(veicolo({ potenzaKw: null }), tariffario(), ANNUALE);
    expect(r.esito).toBe('NON_CALCOLABILE');
    expect(r.importo).toBeNull();
    expect(r.importoRidotto).toBeNull();
  });

  it('elenca tutti i dati mancanti insieme, non solo il primo', () => {
    const r = calcolaBollo(veicolo({ potenzaKw: null, classeAmbientale: null }), tariffario(), ANNUALE);
    expect(r.motivi.map((m) => m.campo)).toEqual(['potenzaKw', 'classeAmbientale']);
  });

  it('non assume la classe ambientale mancante', () => {
    // Il motore precedente assumeva Euro 4, la tariffa più bassa.
    const r = calcolaBollo(veicolo({ classeAmbientale: null }), tariffario(), ANNUALE);
    expect(r.motivi).toEqual([expect.objectContaining({ codice: 'DATO_MANCANTE', campo: 'classeAmbientale' })]);
  });

  it('non assume il tipo di veicolo mancante', () => {
    // Il motore precedente assumeva "Autovettura".
    const r = calcolaBollo(veicolo({ tipoVeicolo: null }), tariffario(), ANNUALE);
    expect(r.motivi).toEqual([expect.objectContaining({ codice: 'DATO_MANCANTE', campo: 'tipoVeicolo' })]);
  });

  it('dichiara i tipi di veicolo senza regola di calcolo', () => {
    const r = calcolaBollo(veicolo({ tipoVeicolo: 'Motrice' }), tariffario(), ANNUALE);
    expect(r.motivi[0].codice).toBe('TIPO_NON_GESTITO');
  });

  it('non assume il numero di assi di un autocarro pesante', () => {
    // Il motore precedente assumeva 2 assi e sospensioni pneumatiche.
    const t = tariffario({
      tariffe: [tariffa({ tipoVeicolo: 'Autocarro', unitaMisura: 'ASSI', sogliaMin: '2', sogliaMax: '2', importoFisso: '299.55', tipoSospensione: 'Pneumatiche' })],
    });
    const r = calcolaBollo(veicolo({ tipoVeicolo: 'Autocarro', pesoComplessivoKg: 14000 }), t, ANNUALE);
    expect(r.motivi.map((m) => m.campo)).toEqual(['numeroAssi', 'tipoSospensione']);
  });

  it('richiede il peso per scegliere fra la formula per portata e quella per assi', () => {
    const t = tariffario({
      tariffe: [tariffa({ tipoVeicolo: 'Autocarro', unitaMisura: 'KG_PORTATA', sogliaMin: '0', sogliaMax: '400', importoFisso: '22.82' })],
    });
    const r = calcolaBollo(veicolo({ tipoVeicolo: 'Autocarro', portataKg: 300 }), t, ANNUALE);
    expect(r.motivi).toEqual([expect.objectContaining({ campo: 'pesoComplessivoKg' })]);
  });

  it('non applica una tariffa se il veicolo è fuori dalla sua fascia', () => {
    // Il motore precedente applicava a un rimorchio da 5 t la tariffa
    // "rimorchi sotto le 3,5 t".
    const t = tariffario({
      tariffe: [tariffa({ tipoVeicolo: 'Rimorchio', unitaMisura: 'FISSO', sogliaMin: '0', sogliaMax: '3500', importoFisso: '25' })],
    });
    const r = calcolaBollo(veicolo({ tipoVeicolo: 'Rimorchio', pesoComplessivoKg: 5000 }), t, ANNUALE);
    expect(r.motivi[0].codice).toBe('FUORI_FASCIA');
  });

  it('dichiara ambigue le tariffe indistinguibili invece di prendere la prima', () => {
    // Il motore precedente sceglieva la prima riga: l'importo dipendeva
    // dall'ordine di inserimento nel database.
    const massa = (importo: string) =>
      tariffa({ tipoVeicolo: 'Trattore stradale', unitaMisura: 'MASSA_RIMORCHIABILE', importoFisso: importo });
    const t = tariffario({
      tariffe: [
        tariffa({ tipoVeicolo: 'Trattore stradale', unitaMisura: 'ASSI', sogliaMin: '2', sogliaMax: '2', importoFisso: '300', tipoSospensione: 'Pneumatiche' }),
        massa('267'),
        massa('585'),
      ],
    });
    const r = calcolaBollo(
      veicolo({ tipoVeicolo: 'Trattore stradale', pesoComplessivoKg: 18000, numeroAssi: 2, tipoSospensione: 'Pneumatiche', massaRimorchiabileKg: 40000 }),
      t,
      ANNUALE,
    );
    expect(r.motivi.map((m) => m.codice)).toEqual(['TARIFFA_AMBIGUA']);
  });

  it('dichiara gli scaglioni sovrapposti', () => {
    const t = tariffario({
      tariffe: [
        ...SCAGLIONI_EURO_456,
        tariffa({ categoriaEuro: 'Euro 4-5-6', sogliaMin: '50', sogliaMax: '150', importoUnitario: '1', descrizione: 'errata' }),
      ],
    });
    expect(calcolaBollo(veicolo(), t, ANNUALE).motivi[0].codice).toBe('TARIFFA_AMBIGUA');
  });

  it('dichiara la potenza oltre l\'ultimo scaglione limitato', () => {
    const t = tariffario({
      tariffe: [tariffa({ categoriaEuro: 'Euro 4-5-6', sogliaMin: '0', sogliaMax: '100', importoUnitario: '2.58' })],
    });
    expect(calcolaBollo(veicolo({ potenzaKw: '120' }), t, ANNUALE).motivi[0].codice).toBe('FUORI_FASCIA');
  });
});

// =====================================================
// PERIODICITÀ
// =====================================================

describe('Motore - periodicità quadrimestrale', () => {
  it('non usa l\'importo annuale per una scadenza quadrimestrale', () => {
    // Il motore precedente lo faceva: il cliente avrebbe pagato il triplo.
    const r = calcolaBollo(veicolo(), tariffario(), QUADRIMESTRALE);
    expect(r.motivi[0].codice).toBe('PERIODICITA_NON_PREVISTA');
  });

  it('usa le tariffe quadrimestrali quando il tariffario le prevede', () => {
    const riga = (periodicita: string, importo: string) =>
      tariffa({ tipoVeicolo: 'Autocarro', unitaMisura: 'ASSI', sogliaMin: '3', sogliaMax: '3', tipoSospensione: 'Pneumatiche', periodicita, importoFisso: importo });
    const t = tariffario({ tariffe: [riga('ANNUALE', '414.20'), riga('QUADRIMESTRALE', '122.74')] });
    const carro = veicolo({ tipoVeicolo: 'Autocarro', pesoComplessivoKg: 18000, numeroAssi: 3, tipoSospensione: 'Pneumatiche' });

    expect(calcolaBollo(carro, t, ANNUALE).importo).toBe('414.20');
    expect(calcolaBollo(carro, t, QUADRIMESTRALE).importo).toBe('122.74');
  });
});

// =====================================================
// ESENZIONI E RIDUZIONI
// =====================================================

describe('Motore - esenzioni', () => {
  const ELETTRICHE = tariffario({ esenzioni: [ESENZIONE_ELETTRICO_TOTALE, ESENZIONE_ELETTRICO_PARZIALE] });
  const elettrica = (dataImmatricolazione: string | null) =>
    calcolaBollo(veicolo({ alimentazione: 'Elettrico', dataImmatricolazione }), ELETTRICHE, ANNUALE);

  it('l\'esenzione totale non richiede i dati tecnici del veicolo', () => {
    const r = calcolaBollo(
      veicolo({ alimentazione: 'Elettrico', dataImmatricolazione: '2024-01-01', potenzaKw: null }),
      ELETTRICHE,
      ANNUALE,
    );
    expect(r.esito).toBe('ESENTE');
    expect(r.importo).toBe('0.00');
  });

  it('esenta gli elettrici per i primi 5 anni, non per 6', () => {
    // Il motore precedente usava "anni <= 5": un veicolo di 5 anni e un
    // giorno risultava ancora esente, mentre la riduzione configurata per lui
    // si chiama "elettrici oltre i 5 anni".
    expect(elettrica('2021-06-16').esito).toBe('ESENTE'); // 4 anni e 364 giorni
    expect(elettrica('2021-06-15').esito).toBe('CALCOLATO'); // 5 anni esatti
    expect(elettrica('2021-06-14').esito).toBe('CALCOLATO'); // 5 anni e un giorno
    expect(elettrica('2021-06-14').esenzioni[0].percentualeRiduzione).toBe('75');
  });

  it('non concede un\'esenzione senza il dato che la giustifica', () => {
    // Il motore precedente, senza data, assumeva "0 anni" ed esentava.
    const r = elettrica(null);
    expect(r.esito).toBe('CALCOLATO');
    expect(r.esenzioni[0].tipo).toBe('PARZIALE');
    expect(r.assunzioni).toEqual([expect.stringContaining('Data di immatricolazione non indicata')]);
  });

  it('applica la sola riduzione più vantaggiosa, senza cumulo', () => {
    // GPL (25%) e ultratrentennale (50%): il motore precedente le cumulava
    // (75%) o no a seconda dell'ordine di valutazione.
    const t = tariffario({ esenzioni: [ESENZIONE_GPL, ESENZIONE_STORICO] });
    const r = calcolaBollo(
      veicolo({ alimentazione: 'GPL', dataImmatricolazione: '1990-01-01' }),
      t,
      ANNUALE,
    );
    expect(r.esenzioni).toHaveLength(1);
    expect(r.esenzioni[0].percentualeRiduzione).toBe('50');
  });

  it('applica la soglia degli ultratrentennali dal trentesimo anno compiuto', () => {
    const t = tariffario({ esenzioni: [ESENZIONE_STORICO] });
    const storica = (data: string) =>
      calcolaBollo(veicolo({ dataImmatricolazione: data }), t, ANNUALE);

    expect(storica('1996-06-16').esenzioni).toHaveLength(0); // 29 anni
    expect(storica('1996-06-15').esenzioni).toHaveLength(1); // 30 anni esatti
  });

  it('dichiara un\'assunzione solo se il beneficio non valutato poteva contare', () => {
    const t = tariffario({ esenzioni: [ESENZIONE_GPL, ESENZIONE_STORICO] });

    // Diesel con data nota e meno di 30 anni: nulla da dichiarare.
    const nota = calcolaBollo(veicolo({ alimentazione: 'Diesel', dataImmatricolazione: '2015-01-01' }), t, ANNUALE);
    expect(nota.assunzioni).toEqual([]);

    // Alimentazione ignota: la riduzione GPL non è valutabile.
    const ignota = calcolaBollo(veicolo({ alimentazione: null, dataImmatricolazione: '2015-01-01' }), t, ANNUALE);
    expect(ignota.assunzioni).toEqual([expect.stringContaining('Alimentazione non indicata')]);
  });

  it('riporta la riduzione nelle note con l\'importo sottratto', () => {
    const t = tariffario({ esenzioni: [ESENZIONE_GPL] });
    const r = calcolaBollo(veicolo({ alimentazione: 'GPL', potenzaKw: '87' }), t, ANNUALE);
    // 224.46 x 25% = 56.115 -> 56.12; 224.46 - 56.115 = 168.345 -> 168.35
    expect(r.importoLordo).toBe('224.46');
    expect(r.importo).toBe('168.35');
    expect(r.note[0]).toMatch(/^Riduzione 25%: -€56\.12/);
  });
});

// =====================================================
// ANZIANITÀ
// =====================================================

describe('anniCompiuti', () => {
  it('conta gli anni compiuti al giorno', () => {
    expect(anniCompiuti('2020-06-15', '2026-06-14')).toBe(5);
    expect(anniCompiuti('2020-06-15', '2026-06-15')).toBe(6);
  });

  it('gestisce il 29 febbraio', () => {
    expect(anniCompiuti('2024-02-29', '2025-02-28')).toBe(0);
    expect(anniCompiuti('2024-02-29', '2025-03-01')).toBe(1);
  });
});
