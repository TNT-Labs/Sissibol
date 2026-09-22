/**
 * Casi costruiti a mano per il golden master.
 *
 * I dati reali dell'archivio coprono pochissimi rami del motore di calcolo
 * (quasi tutti i veicoli importati hanno tipo e potenza non valorizzati).
 * Senza questi casi un refactor potrebbe rompere il calcolo di autocarri,
 * motocicli, rimorchi ed esenzioni senza far fallire alcun test.
 *
 * Ogni caso è pensato per entrare in un ramo preciso di
 * `BolloService.calcolaImportoPerTipo` o di `verificaEsenzioni`, comprese le
 * soglie esatte (100 KW, 11 KW, 12 tonnellate, 5 e 30 anni di anzianità).
 *
 * NB: fissano il comportamento ATTUALE, non quello corretto. Dove il motore
 * oggi sbaglia, il golden master registra l'errore: servirà a rendere visibile
 * la correzione quando verrà fatta.
 */

import type { VeicoloFixture } from '../golden/tariffario.types';

/** Data di riferimento del golden master: 2026-06-15. */
const RIFERIMENTO = new Date('2026-06-15T12:00:00.000Z');

/** Data di immatricolazione a N anni esatti prima della data di riferimento. */
function anniFa(anni: number, giorniExtra = 0): string {
  const d = new Date(RIFERIMENTO);
  d.setUTCFullYear(d.getUTCFullYear() - anni);
  d.setUTCDate(d.getUTCDate() - giorniExtra);
  return d.toISOString().slice(0, 10);
}

const base: Omit<VeicoloFixture, 'id' | 'targa'> = {
  idCliente: 1,
  tipoVeicolo: null,
  classeAmbientale: null,
  regione: 'Lombardia',
  alimentazione: null,
  potenzaKw: null,
  cilindrata: null,
  portataKg: null,
  pesoComplessivoKg: null,
  numeroAssi: null,
  tipoSospensione: null,
  numeroPosti: null,
  massaRimorchiabileKg: null,
  dataImmatricolazione: null,
  attivo: true,
};

let prossimoId = 900001;

function caso(
  targa: string,
  override: Partial<VeicoloFixture>,
): VeicoloFixture {
  return { ...base, id: prossimoId++, targa, ...override };
}

export function casiSintetici(): VeicoloFixture[] {
  prossimoId = 900001;

  return [
    // -------------------------------------------------------------------
    // AUTOVETTURE - scaglioni per KW e classi Euro
    // -------------------------------------------------------------------
    caso('SYN-AUTO-E6-85', {
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '85',
      alimentazione: 'Benzina',
    }),
    caso('SYN-AUTO-E6-100', {
      // Soglia esatta fra il primo e il secondo scaglione
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '100',
      alimentazione: 'Benzina',
    }),
    caso('SYN-AUTO-E6-120', {
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '120',
      alimentazione: 'Benzina',
    }),
    caso('SYN-AUTO-E0-120', {
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 0',
      potenzaKw: '120',
      alimentazione: 'Diesel',
    }),
    caso('SYN-AUTO-E6-87', {
      // Potenze scelte perché l'importo ha due decimali significativi
      // (87 x 2.58 = 224.46): senza casi così, una modifica
      // all'arrotondamento passerebbe inosservata.
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '87',
      alimentazione: 'Benzina',
    }),
    caso('SYN-AUTO-E6-113', {
      // A cavallo dei due scaglioni: 100 x 2.58 + 13 x 3.87 = 308.31
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '113',
      alimentazione: 'Benzina',
    }),
    caso('SYN-AUTO-E6-113-5', {
      // Potenza con decimali: verifica che non venga troncata
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '113.5',
      alimentazione: 'Benzina',
    }),
    caso('SYN-AUTO-E1-70', {
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 1',
      potenzaKw: '70',
    }),
    caso('SYN-AUTO-E2-70', {
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 2',
      potenzaKw: '70',
    }),
    caso('SYN-AUTO-E3-70', {
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 3',
      potenzaKw: '70',
    }),
    caso('SYN-AUTO-E7-70', {
      // Euro 7: mappata su 'Euro 4-5-6' dalla tabella di conversione
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 7',
      potenzaKw: '70',
    }),
    caso('SYN-AUTO-EURO-IGNOTA', {
      // Classe non presente nella tabella: deve ricadere sul default
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 99',
      potenzaKw: '70',
    }),
    caso('SYN-AUTO-SENZA-EURO', {
      // classeAmbientale null: il motore assume 'Euro 4'
      tipoVeicolo: 'Autovettura',
      potenzaKw: '70',
    }),
    caso('SYN-AUTO-SENZA-KW', {
      // Dato mancante: oggi restituisce 0 con nota
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
    }),
    caso('SYN-PROMISCUO-E6-90', {
      tipoVeicolo: 'Autoveicolo uso promiscuo',
      classeAmbientale: 'Euro 6',
      potenzaKw: '90',
    }),

    // -------------------------------------------------------------------
    // MOTOCICLI - importo fisso sotto 11 KW, per KW eccedenti sopra
    // -------------------------------------------------------------------
    caso('SYN-MOTO-E3-8', {
      tipoVeicolo: 'Motociclo',
      classeAmbientale: 'Euro 3',
      potenzaKw: '8',
    }),
    caso('SYN-MOTO-E3-11', {
      // Soglia esatta: 11 KW
      tipoVeicolo: 'Motociclo',
      classeAmbientale: 'Euro 3',
      potenzaKw: '11',
    }),
    caso('SYN-MOTO-E3-35', {
      tipoVeicolo: 'Motociclo',
      classeAmbientale: 'Euro 3',
      potenzaKw: '35',
    }),
    caso('SYN-MOTO-E0-35', {
      tipoVeicolo: 'Motociclo',
      classeAmbientale: 'Euro 0',
      potenzaKw: '35',
    }),
    caso('SYN-MOTO-E5-35', {
      // Euro 5 motociclo: mappato su 'Euro 3 e successivi'
      tipoVeicolo: 'Motociclo',
      classeAmbientale: 'Euro 5',
      potenzaKw: '35',
    }),
    caso('SYN-MOTO-SENZA-KW', {
      tipoVeicolo: 'Motociclo',
      classeAmbientale: 'Euro 3',
    }),

    // -------------------------------------------------------------------
    // AUTOCARRI - sotto 12t per portata, da 12t per assi e sospensione
    // -------------------------------------------------------------------
    caso('SYN-CARRO-P1200', {
      tipoVeicolo: 'Autocarro',
      portataKg: 1200,
      pesoComplessivoKg: 3500,
    }),
    caso('SYN-CARRO-P7500', {
      tipoVeicolo: 'Autocarro',
      portataKg: 7500,
      pesoComplessivoKg: 11000,
    }),
    caso('SYN-CARRO-P9000', {
      // Portata oltre l'ultimo scaglione del tariffario (8000 kg)
      tipoVeicolo: 'Autocarro',
      portataKg: 9000,
      pesoComplessivoKg: 11500,
    }),
    caso('SYN-CARRO-12T-2A-PNEU', {
      // Soglia esatta delle 12 tonnellate
      tipoVeicolo: 'Autocarro',
      pesoComplessivoKg: 12000,
      numeroAssi: 2,
      tipoSospensione: 'Pneumatiche',
    }),
    caso('SYN-CARRO-18T-3A-PNEU', {
      tipoVeicolo: 'Autocarro',
      pesoComplessivoKg: 18000,
      numeroAssi: 3,
      tipoSospensione: 'Pneumatiche',
    }),
    caso('SYN-CARRO-26T-4A-NONPNEU', {
      tipoVeicolo: 'Autocarro',
      pesoComplessivoKg: 26000,
      numeroAssi: 4,
      tipoSospensione: 'Non pneumatiche',
    }),
    caso('SYN-CARRO-14T-SENZA-ASSI', {
      // Autocarro pesante senza numero assi: il motore assume 2 assi
      tipoVeicolo: 'Autocarro',
      pesoComplessivoKg: 14000,
    }),
    caso('SYN-CARRO-SENZA-DATI', {
      // Né peso né portata: oggi restituisce 0 con avviso
      tipoVeicolo: 'Autocarro',
    }),
    caso('SYN-AUTOTRENO-20T', {
      tipoVeicolo: 'Autotreno',
      pesoComplessivoKg: 20000,
      numeroAssi: 3,
      tipoSospensione: 'Pneumatiche',
    }),
    caso('SYN-AUTOARTIC-30T', {
      tipoVeicolo: 'Autoarticolato',
      pesoComplessivoKg: 30000,
      numeroAssi: 4,
      tipoSospensione: 'Pneumatiche',
    }),

    // -------------------------------------------------------------------
    // TRATTORI STRADALI - tassa aggiuntiva su massa rimorchiabile
    // -------------------------------------------------------------------
    caso('SYN-TRATTORE-40T', {
      tipoVeicolo: 'Trattore stradale',
      pesoComplessivoKg: 18000,
      numeroAssi: 2,
      tipoSospensione: 'Pneumatiche',
      massaRimorchiabileKg: 40000,
    }),
    caso('SYN-TRATTORE-SENZA-MASSA', {
      tipoVeicolo: 'Trattore stradale',
      pesoComplessivoKg: 18000,
      numeroAssi: 2,
      tipoSospensione: 'Pneumatiche',
    }),

    // -------------------------------------------------------------------
    // VEICOLI TARIFFATI A KW SECCO
    // -------------------------------------------------------------------
    caso('SYN-AUTOBUS-150', {
      tipoVeicolo: 'Autobus',
      potenzaKw: '150',
      numeroPosti: 50,
    }),
    caso('SYN-SPECIALE-100', {
      tipoVeicolo: 'Autoveicolo speciale',
      potenzaKw: '100',
    }),
    caso('SYN-CARAVAN-90', {
      tipoVeicolo: 'Autocaravan',
      potenzaKw: '90',
    }),

    // -------------------------------------------------------------------
    // MOTOCARRI E MOTOFURGONI - tariffa per cilindrata
    // -------------------------------------------------------------------
    caso('SYN-MOTOCARRO-100CC', {
      tipoVeicolo: 'Motocarro',
      cilindrata: 100,
    }),
    caso('SYN-MOTOCARRO-300CC', {
      tipoVeicolo: 'Motocarro',
      cilindrata: 300,
    }),
    caso('SYN-MOTOCARRO-600CC', {
      // Oltre l'ultimo scaglione (500 cc)
      tipoVeicolo: 'Motocarro',
      cilindrata: 600,
    }),
    caso('SYN-MOTOFURGONE-200CC', {
      tipoVeicolo: 'Motofurgone',
      cilindrata: 200,
    }),
    caso('SYN-MOTOCARRO-SENZA-CC', {
      tipoVeicolo: 'Motocarro',
    }),

    // -------------------------------------------------------------------
    // RIMORCHI
    // -------------------------------------------------------------------
    caso('SYN-RIMORCHIO-2000', {
      tipoVeicolo: 'Rimorchio',
      pesoComplessivoKg: 2000,
    }),
    caso('SYN-RIMORCHIO-5000', {
      tipoVeicolo: 'Rimorchio',
      pesoComplessivoKg: 5000,
    }),
    caso('SYN-RIMORCHIO-SPECIALE-4000', {
      tipoVeicolo: 'Rimorchio speciale',
      pesoComplessivoKg: 4000,
    }),
    caso('SYN-SEMIRIMORCHIO-8000', {
      tipoVeicolo: 'Semirimorchio',
      pesoComplessivoKg: 8000,
    }),
    caso('SYN-RIM-PERSONE-10', {
      tipoVeicolo: 'Rimorchio trasporto persone',
      numeroPosti: 10,
    }),
    caso('SYN-RIM-PERSONE-20', {
      tipoVeicolo: 'Rimorchio trasporto persone',
      numeroPosti: 20,
    }),
    caso('SYN-RIM-PERSONE-30', {
      tipoVeicolo: 'Rimorchio trasporto persone',
      numeroPosti: 30,
    }),
    caso('SYN-RIM-PERSONE-50', {
      tipoVeicolo: 'Rimorchio trasporto persone',
      numeroPosti: 50,
    }),
    caso('SYN-RIM-PERSONE-SENZA-POSTI', {
      tipoVeicolo: 'Rimorchio trasporto persone',
    }),

    // -------------------------------------------------------------------
    // TIPI CHE IL MOTORE NON CONOSCE
    // -------------------------------------------------------------------
    caso('SYN-MOTRICE-150KW', {
      // 'Motrice' è prodotto dal mapping dell'import ma non esiste nel tariffario
      tipoVeicolo: 'Motrice',
      potenzaKw: '150',
    }),
    caso('SYN-ALTRO-100KW', {
      // 'Altro' è il mapping di "targa prova"
      tipoVeicolo: 'Altro',
      potenzaKw: '100',
    }),
    caso('SYN-TIPO-NULL-100KW', {
      // tipoVeicolo null: il motore assume 'Autovettura'
      potenzaKw: '100',
      classeAmbientale: 'Euro 6',
    }),

    // -------------------------------------------------------------------
    // ESENZIONI E RIDUZIONI
    // -------------------------------------------------------------------
    caso('SYN-ELETTRICO-2A', {
      // Entro i 5 anni: esenzione totale
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '100',
      alimentazione: 'Elettrico',
      dataImmatricolazione: anniFa(2),
    }),
    caso('SYN-ELETTRICO-5A-ESATTI', {
      // Soglia esatta dei 5 anni
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '100',
      alimentazione: 'Elettrico',
      dataImmatricolazione: anniFa(5),
    }),
    caso('SYN-ELETTRICO-5A-PIU-1G', {
      // Un giorno oltre la soglia dei 5 anni
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '100',
      alimentazione: 'Elettrico',
      dataImmatricolazione: anniFa(5, 1),
    }),
    caso('SYN-ELETTRICO-8A', {
      // Oltre i 5 anni: riduzione parziale 75%
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '100',
      alimentazione: 'Elettrico',
      dataImmatricolazione: anniFa(8),
    }),
    caso('SYN-ELETTRICO-SENZA-DATA', {
      // Elettrico senza data immatricolazione: anzianità calcolata come 0
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '100',
      alimentazione: 'Elettrico',
    }),
    caso('SYN-ELETTRICO-35A', {
      // Elettrico e ultratrentennale insieme: il caso di conflitto
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 0',
      potenzaKw: '100',
      alimentazione: 'Elettrico',
      dataImmatricolazione: anniFa(35),
    }),
    caso('SYN-GPL', {
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '100',
      alimentazione: 'GPL',
    }),
    caso('SYN-GPL-87', {
      // Riduzione 25% su un importo con decimali: 224.46 x 0.75 = 168.35
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '87',
      alimentazione: 'GPL',
    }),
    caso('SYN-METANO', {
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '100',
      alimentazione: 'Metano',
    }),
    caso('SYN-GPL-35A', {
      // GPL e ultratrentennale: due riduzioni parziali potenzialmente cumulabili
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 0',
      potenzaKw: '100',
      alimentazione: 'GPL',
      dataImmatricolazione: anniFa(35),
    }),
    caso('SYN-STORICO-29A', {
      // Un anno sotto la soglia: nessuna riduzione
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 0',
      potenzaKw: '100',
      alimentazione: 'Diesel',
      dataImmatricolazione: anniFa(29),
    }),
    caso('SYN-STORICO-30A-ESATTI', {
      // Soglia esatta dei 30 anni
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 0',
      potenzaKw: '100',
      alimentazione: 'Diesel',
      dataImmatricolazione: anniFa(30),
    }),
    caso('SYN-STORICO-35A', {
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 0',
      potenzaKw: '100',
      alimentazione: 'Diesel',
      dataImmatricolazione: anniFa(35),
    }),
    caso('SYN-IBRIDO', {
      // Alimentazione senza esenzione configurata
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '100',
      alimentazione: 'Ibrido benzina',
    }),

    // -------------------------------------------------------------------
    // REGIONI
    // -------------------------------------------------------------------
    caso('SYN-REGIONE-NULL', {
      // regione null: il motore assume 'Lombardia'
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '100',
      regione: null,
    }),
    caso('SYN-REGIONE-VENETO', {
      // Regione senza tariffario configurato e senza fallback DEFAULT
      tipoVeicolo: 'Autovettura',
      classeAmbientale: 'Euro 6',
      potenzaKw: '100',
      regione: 'Veneto',
    }),
    caso('SYN-REGIONE-TRENTINO', {
      tipoVeicolo: 'Autocarro',
      pesoComplessivoKg: 18000,
      numeroAssi: 3,
      tipoSospensione: 'Pneumatiche',
      regione: 'Trentino-Alto Adige',
    }),
  ];
}
