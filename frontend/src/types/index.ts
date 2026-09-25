export const Ruolo = {
  ADMIN: 'ADMIN',
  OPERATORE: 'OPERATORE',
} as const;

export type Ruolo = typeof Ruolo[keyof typeof Ruolo];

export const StatoScadenza = {
  DA_PAGARE: 'DA_PAGARE',
  PAGATO: 'PAGATO',
  SCADUTO: 'SCADUTO',
} as const;

export type StatoScadenza = typeof StatoScadenza[keyof typeof StatoScadenza];

export const Periodicita = {
  QUADRIMESTRALE: 'QUADRIMESTRALE',
  ANNUALE: 'ANNUALE',
} as const;

export type Periodicita = typeof Periodicita[keyof typeof Periodicita];

export const TipoCliente = {
  PERSONA_FISICA: 'PERSONA_FISICA',
  PERSONA_GIURIDICA: 'PERSONA_GIURIDICA',
} as const;

export type TipoCliente = typeof TipoCliente[keyof typeof TipoCliente];

export interface Utente {
  id: number;
  email: string;
  ruolo: Ruolo;
  /** Deve scegliere una nuova password prima di usare l'applicazione */
  deveCambiarePassword?: boolean;
  /** Accesso sospeso fino a questo istante dopo troppi errori */
  bloccatoFinoA?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Cliente {
  id: number;
  tipoCliente: TipoCliente;
  // Persona Giuridica
  ragioneSociale?: string;
  partitaIva?: string;
  // Persona Fisica
  nome?: string;
  cognome?: string;
  codiceFiscale?: string;
  // Campi comuni
  indirizzo?: string;
  email?: string;
  telefono?: string;
  note?: string;
  attivo: boolean;
  /** Il cliente riceve gli avvisi di scadenza via email */
  avvisiEmail: boolean;
  createdAt: string;
  updatedAt: string;
  veicoli?: Veicolo[];
}

// Helper per ottenere il nome visualizzato del cliente
export const getClienteDisplayName = (
  cliente: Pick<Cliente, 'tipoCliente' | 'ragioneSociale' | 'nome' | 'cognome'>,
): string => {
  if (cliente.tipoCliente === TipoCliente.PERSONA_FISICA) {
    return `${cliente.cognome || ''} ${cliente.nome || ''}`.trim() || 'N/A';
  }
  return cliente.ragioneSociale || 'N/A';
};

export interface Veicolo {
  id: number;
  idCliente: number;
  targa: string;
  tipoVeicolo?: string;
  classeAmbientale?: string;
  regione?: string;
  // Nuovi campi per calcolo bollo (tariffario Lombardia 2026)
  alimentazione?: string;
  potenzaKw?: number;
  cilindrata?: number;
  portataKg?: number;
  pesoComplessivoKg?: number;
  numeroAssi?: number;
  tipoSospensione?: string;
  numeroPosti?: number;
  massaRimorchiabileKg?: number;
  dataImmatricolazione?: string;
  note?: string;
  /** Soft-delete: false = veicolo disattivato */
  attivo?: boolean;
  createdAt: string;
  updatedAt: string;
  cliente?: Cliente;
  scadenze?: Scadenza[];
}

export interface Scadenza {
  id: number;
  idVeicolo: number;
  /**
   * Data effettiva di scadenza (ISO, YYYY-MM-DD): e' la fonte di verita'.
   * meseScadenza e annoScadenza ne derivano e restano per compatibilita'.
   */
  dataScadenza: string;
  meseScadenza: number;  // 1-12, derivato da dataScadenza
  annoScadenza: number;  // derivato da dataScadenza
  periodicita: Periodicita;
  importoPrevisto?: number;
  stato: StatoScadenza;
  createdAt: string;
  updatedAt: string;
  veicolo?: Veicolo;
  pagamenti?: Pagamento[];
  avvisi?: Avviso[];
}

export type TipoAvviso = 'PRIMO' | 'SECONDO' | 'SOLLECITO';
export type CanaleAvviso = 'EMAIL' | 'ARCHIVIO';
export type EsitoAvviso = 'DA_INVIARE' | 'IN_INVIO' | 'INVIATO' | 'ERRORE' | 'ANNULLATO';

/**
 * Avviso di scadenza al cliente.
 * Il canale ARCHIVIO indica un avviso recuperato dallo storico Access, di cui
 * si conosce la data ma non il mezzo con cui fu inviato.
 */
export interface Avviso {
  id: number;
  idScadenza: number;
  tipo: TipoAvviso;
  canale: CanaleAvviso;
  destinatario?: string | null;
  dataInvio?: string | null;
  esito: EsitoAvviso;
  errore?: string | null;
  note?: string | null;
  tentativi?: number;
  prossimoTentativo?: string | null;
  /** Istante esatto dell'invio (dataInvio ne è il giorno) */
  inviatoIl?: string | null;
  idMessaggio?: string | null;
  oggetto?: string | null;
  testo?: string | null;
}

export interface Pagamento {
  id: number;
  idScadenza: number;
  dataPagamento: string;
  importoPagato: number;
  metodoPagamento?: string;
  ricevutaFile?: string;
  /** Versione per optimistic locking lato server */
  version?: number;
  createdAt: string;
  updatedAt: string;
  scadenza?: Scadenza;
}

export interface AuthResponse {
  access_token: string;
  user: Utente;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  ruolo: Ruolo;
}

// =====================================================
// TIPI PER CALCOLO BOLLO E TARIFFE
// =====================================================

export interface ConfigurazioneBollo {
  id: number;
  annoValidita: number;
  regione: string;
  scontoRid: number;
  attivo: boolean;
  note?: string;
  createdAt: string;
  updatedAt: string;
  tariffe?: TariffaBollo[];
  _count?: { tariffe: number };
}

export interface TariffaBollo {
  id: number;
  idConfigurazione: number;
  tipoVeicolo: string;
  categoriaEuro?: string;
  unitaMisura: string;
  sogliaMin?: number;
  sogliaMax?: number;
  importoUnitario: number;
  importoFisso?: number;
  tipoSospensione?: string;
  periodicita: string;
  descrizione?: string;
  ordine: number;
  createdAt: string;
  updatedAt: string;
}

export interface TariffaApplicata {
  descrizione: string;
  importo: number;
  unitaMisura: string;
  valore: number | null;
}

export interface EsenzioneApplicata {
  tipo: string;
  descrizione: string;
  percentualeRiduzione: number | null;
}

/**
 * Esito del motore di calcolo:
 * - CALCOLATO: importo determinato dal tariffario;
 * - ESENTE: nulla da pagare (importo 0 legittimo);
 * - NON_CALCOLABILE: mancano dati o tariffe, importo null. Mai zero.
 */
export type EsitoCalcolo = 'CALCOLATO' | 'ESENTE' | 'NON_CALCOLABILE';

export interface MotivoNonCalcolabile {
  codice: string;
  /** Campo del veicolo da completare, quando il motivo riguarda un dato */
  campo?: string;
  messaggio: string;
}

export interface CalcoloBolloResult {
  esito: EsitoCalcolo;
  /** Importo dovuto; 0 se esente, null se non calcolabile */
  importoBase: number | null;
  /** Importo prima delle riduzioni parziali */
  importoLordo: number | null;
  importoRidotto: number | null;
  scontoRid: number;
  tariffeApplicate: TariffaApplicata[];
  esenzioni: EsenzioneApplicata[];
  /** Perché il calcolo non è stato possibile */
  motivi: MotivoNonCalcolabile[];
  /** Benefici (esenzioni, riduzioni) non valutati per dati mancanti */
  assunzioni: string[];
  note: string[];
  dettaglioCalcolo: string;
  versioneMotore: string;
  idConfigurazione: number | null;
  regioneConfigurazione: string | null;
}
