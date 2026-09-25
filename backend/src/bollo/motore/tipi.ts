/**
 * Tipi del motore di calcolo del bollo.
 *
 * Il motore è un modulo PURO: non dipende da Prisma, da NestJS né dall'orologio
 * di sistema. Riceve tutto ciò che gli serve come dati e restituisce un
 * risultato; a parità di input produce sempre lo stesso output.
 *
 * I valori decimali (potenza, importi, soglie, percentuali) viaggiano come
 * stringhe: è l'unica rappresentazione che attraversa JSON, database e codice
 * senza perdere precisione. All'interno i calcoli usano decimal.js.
 */

export type Periodicita = 'ANNUALE' | 'QUADRIMESTRALE';

/** Dati del veicolo rilevanti per il calcolo. */
export interface VeicoloInput {
  tipoVeicolo: string | null;
  classeAmbientale: string | null;
  alimentazione: string | null;
  /** Potenza in KW, decimale come stringa */
  potenzaKw: string | null;
  cilindrata: number | null;
  portataKg: number | null;
  pesoComplessivoKg: number | null;
  numeroAssi: number | null;
  tipoSospensione: string | null;
  numeroPosti: number | null;
  massaRimorchiabileKg: number | null;
  /** Data di prima immatricolazione, formato YYYY-MM-DD */
  dataImmatricolazione: string | null;
}

/** Una riga del tariffario. */
export interface TariffaInput {
  id?: number;
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
}

/** Una esenzione o riduzione configurata. */
export interface EsenzioneInput {
  id?: number;
  tipoEsenzione: 'TOTALE' | 'PARZIALE';
  percentualeRiduzione: string | null;
  tipoVeicolo: string | null;
  alimentazione: string | null;
  /**
   * Doppio significato, ereditato dallo schema:
   * - insieme a `alimentazione` è un limite SUPERIORE di validità
   *   ("elettrico esente per i primi 5 anni");
   * - da solo è una soglia MINIMA ("ultratrentennali").
   */
  anniDaImmatricolazione: number | null;
  descrizione: string;
}

/** Tariffario già selezionato per anno e regione. */
export interface TariffarioInput {
  id: number;
  anno: number;
  regione: string;
  /** Percentuale di sconto per domiciliazione bancaria */
  scontoRid: string;
  tariffe: TariffaInput[];
  esenzioni: EsenzioneInput[];
}

export interface ContestoCalcolo {
  periodicita: Periodicita;
  /**
   * Data rispetto a cui misurare l'anzianità del veicolo (YYYY-MM-DD).
   * È un parametro, non `new Date()`: il motore resta deterministico e la
   * scelta della data di riferimento è esplicita nel chiamante.
   */
  dataRiferimento: string;
}

// =====================================================
// RISULTATO
// =====================================================

/**
 * - CALCOLATO: importo determinato dal tariffario.
 * - ESENTE: il veicolo non deve nulla (importo 0 legittimo).
 * - NON_CALCOLABILE: mancano dati o tariffe; l'importo è null, MAI zero.
 */
export type EsitoCalcolo = 'CALCOLATO' | 'ESENTE' | 'NON_CALCOLABILE';

export type CodiceMotivo =
  /** Manca un dato del veicolo necessario alla formula */
  | 'DATO_MANCANTE'
  /** Un dato del veicolo ha un valore non riconosciuto */
  | 'DATO_NON_VALIDO'
  /** Il motore non ha una regola di calcolo per questo tipo di veicolo */
  | 'TIPO_NON_GESTITO'
  /** Il tariffario non contiene righe per questo caso */
  | 'TARIFFA_MANCANTE'
  /** Il valore del veicolo non ricade in alcuna fascia del tariffario */
  | 'FUORI_FASCIA'
  /** Più righe del tariffario si applicano in modo indistinguibile */
  | 'TARIFFA_AMBIGUA'
  /** Il tariffario non prevede la periodicità richiesta per questo veicolo */
  | 'PERIODICITA_NON_PREVISTA'
  /** Nessun tariffario configurato per l'anno e la regione */
  | 'TARIFFARIO_ASSENTE';

export interface MotivoNonCalcolabile {
  codice: CodiceMotivo;
  /** Campo del veicolo coinvolto, quando il motivo riguarda un dato */
  campo?: string;
  messaggio: string;
}

export interface VoceApplicata {
  descrizione: string;
  /** Importo della voce, 2 decimali */
  importo: string;
  unitaMisura: string;
  /** Quantità a cui si applica la tariffa (KW, cc...), se pertinente */
  valore: string | null;
}

export interface EsenzioneApplicata {
  tipo: 'TOTALE' | 'PARZIALE';
  descrizione: string;
  percentualeRiduzione: string | null;
}

export interface RisultatoCalcolo {
  versioneMotore: string;
  esito: EsitoCalcolo;
  /** Importo prima delle riduzioni parziali; null se non calcolabile */
  importoLordo: string | null;
  /** Importo dovuto; 0 se esente, null se non calcolabile */
  importo: string | null;
  /** Importo con sconto per domiciliazione bancaria, se previsto */
  importoRidotto: string | null;
  scontoRid: string;
  voci: VoceApplicata[];
  esenzioni: EsenzioneApplicata[];
  /** Perché il calcolo non è stato possibile; vuoto se CALCOLATO o ESENTE */
  motivi: MotivoNonCalcolabile[];
  /**
   * Benefici che non è stato possibile valutare per mancanza di dati.
   * Il calcolo prosegue senza concederli, e lo dichiara.
   */
  assunzioni: string[];
  /** Note informative (riduzioni applicate, esenzione) */
  note: string[];
  /** Passaggi del calcolo in forma leggibile */
  dettaglio: string[];
}
