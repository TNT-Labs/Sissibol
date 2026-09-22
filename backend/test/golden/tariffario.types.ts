/**
 * Forma dei fixture del golden master.
 *
 * I valori numerici che nel database sono `Decimal` vengono serializzati come
 * stringa per non perdere precisione passando da JSON; lo stub Prisma li
 * riconverte in `Decimal` prima di passarli al motore di calcolo.
 */

export interface TariffaFixture {
  id: number;
  tipoVeicolo: string;
  categoriaEuro: string | null;
  unitaMisura: string;
  sogliaMin: string | null;
  sogliaMax: string | null;
  importoUnitario: string;
  importoFisso: string | null;
  tipoSospensione: string | null;
  periodicita: string;
  descrizione: string | null;
  ordine: number;
}

/**
 * Le esenzioni arrivano al servizio via `$queryRaw`, quindi con i nomi di
 * colonna del database (snake_case) e non con quelli del modello Prisma.
 */
export interface EsenzioneFixture {
  id: number;
  id_configurazione: number;
  tipo_esenzione: 'TOTALE' | 'PARZIALE';
  percentuale_riduzione: string | null;
  tipo_veicolo: string | null;
  alimentazione: string | null;
  anni_da_immatricolazione: number | null;
  descrizione: string;
  note: string | null;
}

export interface ConfigurazioneFixture {
  id: number;
  annoValidita: number;
  regione: string;
  scontoRid: string;
  attivo: boolean;
  note: string | null;
  tariffe: TariffaFixture[];
  esenzioni: EsenzioneFixture[];
}

export interface TariffarioFixture {
  generatoIl: string;
  origine: string;
  configurazioni: ConfigurazioneFixture[];
}

/** Veicolo del corpus, nella forma restituita da `prisma.veicolo.findUnique`. */
export interface VeicoloFixture {
  id: number;
  targa: string;
  idCliente: number;
  tipoVeicolo: string | null;
  classeAmbientale: string | null;
  regione: string | null;
  alimentazione: string | null;
  potenzaKw: string | null;
  cilindrata: number | null;
  portataKg: number | null;
  pesoComplessivoKg: number | null;
  numeroAssi: number | null;
  tipoSospensione: string | null;
  numeroPosti: number | null;
  massaRimorchiabileKg: number | null;
  dataImmatricolazione: string | null;
  attivo: boolean;
}

export interface CorpusFixture {
  generatoIl: string;
  origine: string;
  /** Veicoli reali importati dall'archivio Access. */
  reali: VeicoloFixture[];
  /** Casi costruiti a mano per coprire i rami del motore non presenti nei dati reali. */
  sintetici: VeicoloFixture[];
}

/** Esito del calcolo per un singolo veicolo, come registrato nel golden master. */
export interface GoldenEntry {
  targa: string;
  tipoVeicolo: string | null;
  regione: string | null;
  anno: number;
  periodicita: 'ANNUALE' | 'QUADRIMESTRALE';
  /** 'OK' se il calcolo è andato a buon fine, 'ERRORE' se ha sollevato eccezione. */
  esito: 'OK' | 'ERRORE';
  errore?: string;
  importoBase?: number;
  importoRidotto?: number | null;
  scontoRid?: number;
  esenzioni?: Array<{
    tipo: string;
    descrizione: string;
    percentualeRiduzione: number | null;
  }>;
  tariffeApplicate?: Array<{
    descrizione: string;
    importo: number;
    unitaMisura: string;
    valore: number | null;
  }>;
  note?: string[];
  dettaglioCalcolo?: string;
}

export interface GoldenFixture {
  generatoIl: string;
  dataRiferimento: string;
  /** Riepilogo leggibile: quanti veicoli finiscono in ciascun esito. */
  riepilogo: Record<string, number>;
  risultati: GoldenEntry[];
}
