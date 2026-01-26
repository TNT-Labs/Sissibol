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
  createdAt: string;
  updatedAt: string;
  veicoli?: Veicolo[];
}

// Helper per ottenere il nome visualizzato del cliente
export const getClienteDisplayName = (cliente: Cliente): string => {
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
  createdAt: string;
  updatedAt: string;
  cliente?: Cliente;
  scadenze?: Scadenza[];
}

export interface Scadenza {
  id: number;
  idVeicolo: number;
  meseScadenza: number;  // 1-12
  annoScadenza: number;
  periodicita: Periodicita;
  importoPrevisto?: number;
  stato: StatoScadenza;
  createdAt: string;
  updatedAt: string;
  veicolo?: Veicolo;
  pagamenti?: Pagamento[];
}

export interface Pagamento {
  id: number;
  idScadenza: number;
  dataPagamento: string;
  importoPagato: number;
  metodoPagamento?: string;
  ricevutaFile?: string;
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

export interface CalcoloBolloResult {
  importoBase: number;
  importoRidotto: number | null;
  scontoRid: number;
  tariffeApplicate: TariffaApplicata[];
  esenzioni: EsenzioneApplicata[];
  note: string[];
  dettaglioCalcolo: string;
}
