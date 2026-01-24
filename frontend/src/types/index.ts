export enum Ruolo {
  ADMIN = 'ADMIN',
  OPERATORE = 'OPERATORE',
}

export enum StatoScadenza {
  DA_PAGARE = 'DA_PAGARE',
  PAGATO = 'PAGATO',
  SCADUTO = 'SCADUTO',
}

export interface Utente {
  id: number;
  email: string;
  ruolo: Ruolo;
  createdAt: string;
  updatedAt: string;
}

export interface Cliente {
  id: number;
  ragioneSociale: string;
  partitaIva?: string;
  indirizzo?: string;
  email?: string;
  telefono?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  veicoli?: Veicolo[];
}

export interface Veicolo {
  id: number;
  idCliente: number;
  targa: string;
  tipoVeicolo?: string;
  classeAmbientale?: string;
  regione?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  cliente?: Cliente;
  scadenze?: Scadenza[];
}

export interface Scadenza {
  id: number;
  idVeicolo: number;
  dataScadenza: string;
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
