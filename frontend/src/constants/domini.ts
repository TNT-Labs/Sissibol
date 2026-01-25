// Domini per i campi con valori predefiniti

// Tipi veicolo allineati al tariffario Regione Lombardia 2026
export const TIPI_VEICOLO = [
  'Autovettura',
  'Autoveicolo uso promiscuo',
  'Autobus',
  'Autocarro',
  'Autotreno',
  'Autoarticolato',
  'Trattore stradale',
  'Autoveicolo speciale',
  'Autocaravan',
  'Motociclo',
  'Ciclomotore',
  'Motocarro',
  'Motofurgone',
  'Quadriciclo',
  'Rimorchio',
  'Rimorchio speciale',
  'Semirimorchio',
  'Rimorchio trasporto persone',
  'Macchina agricola',
  'Macchina operatrice',
] as const;

export type TipoVeicolo = typeof TIPI_VEICOLO[number];

// Tipi di alimentazione
export const TIPI_ALIMENTAZIONE = [
  'Benzina',
  'Diesel',
  'GPL',
  'Metano',
  'Ibrido benzina',
  'Ibrido diesel',
  'Elettrico',
  'Idrogeno',
] as const;

export type TipoAlimentazione = typeof TIPI_ALIMENTAZIONE[number];

// Tipi di sospensione (per autocarri >= 12 ton)
export const TIPI_SOSPENSIONE = [
  'Pneumatiche',
  'Non pneumatiche',
] as const;

export type TipoSospensione = typeof TIPI_SOSPENSIONE[number];

// Configurazione campi per tipo veicolo (quali campi mostrare nel form)
export const CAMPI_PER_TIPO_VEICOLO: Record<string, {
  potenzaKw?: boolean;
  cilindrata?: boolean;
  portataKg?: boolean;
  pesoComplessivoKg?: boolean;
  numeroAssi?: boolean;
  tipoSospensione?: boolean;
  numeroPosti?: boolean;
  massaRimorchiabileKg?: boolean;
  ripianoTariffario?: string;
}> = {
  'Autovettura': {
    potenzaKw: true,
    ripianoTariffario: 'Autovetture e autoveicoli uso promiscuo'
  },
  'Autoveicolo uso promiscuo': {
    potenzaKw: true,
    ripianoTariffario: 'Autovetture e autoveicoli uso promiscuo'
  },
  'Autobus': {
    potenzaKw: true,
    ripianoTariffario: 'Autobus'
  },
  'Autocarro': {
    potenzaKw: true,
    portataKg: true,
    pesoComplessivoKg: true,
    numeroAssi: true,
    tipoSospensione: true,
    ripianoTariffario: 'Autocarri'
  },
  'Autotreno': {
    potenzaKw: true,
    portataKg: true,
    pesoComplessivoKg: true,
    numeroAssi: true,
    tipoSospensione: true,
    ripianoTariffario: 'Autocarri'
  },
  'Autoarticolato': {
    potenzaKw: true,
    portataKg: true,
    pesoComplessivoKg: true,
    numeroAssi: true,
    tipoSospensione: true,
    ripianoTariffario: 'Autocarri'
  },
  'Trattore stradale': {
    potenzaKw: true,
    pesoComplessivoKg: true,
    numeroAssi: true,
    tipoSospensione: true,
    massaRimorchiabileKg: true,
    ripianoTariffario: 'Autocarri + Tassa aggiuntiva massa rimorchiabile'
  },
  'Autoveicolo speciale': {
    potenzaKw: true,
    ripianoTariffario: 'Autoveicoli speciali'
  },
  'Autocaravan': {
    potenzaKw: true,
    ripianoTariffario: 'Autocaravan'
  },
  'Motociclo': {
    potenzaKw: true,
    cilindrata: true,
    ripianoTariffario: 'Motocicli oltre 50cc'
  },
  'Ciclomotore': {
    cilindrata: true,
    ripianoTariffario: 'Ciclomotori (esenti o tassa ridotta)'
  },
  'Motocarro': {
    cilindrata: true,
    ripianoTariffario: 'Motocarri e motofurgoni'
  },
  'Motofurgone': {
    cilindrata: true,
    ripianoTariffario: 'Motocarri e motofurgoni'
  },
  'Quadriciclo': {
    potenzaKw: true,
    cilindrata: true,
    ripianoTariffario: 'Quadricicli'
  },
  'Rimorchio': {
    pesoComplessivoKg: true,
    ripianoTariffario: 'Rimorchi con massa < 3.5 ton'
  },
  'Rimorchio speciale': {
    pesoComplessivoKg: true,
    ripianoTariffario: 'Rimorchi speciali con massa >= 3.5 ton'
  },
  'Semirimorchio': {
    pesoComplessivoKg: true,
    ripianoTariffario: 'Rimorchi/Semirimorchi'
  },
  'Rimorchio trasporto persone': {
    numeroPosti: true,
    ripianoTariffario: 'Rimorchi trasporto persone'
  },
  'Macchina agricola': {
    potenzaKw: true,
    ripianoTariffario: 'Macchine agricole'
  },
  'Macchina operatrice': {
    potenzaKw: true,
    ripianoTariffario: 'Macchine operatrici'
  },
};

// Helper per verificare se un campo deve essere mostrato per un tipo veicolo
export const shouldShowField = (tipoVeicolo: string | undefined, campo: keyof typeof CAMPI_PER_TIPO_VEICOLO[string]): boolean => {
  if (!tipoVeicolo) return false;
  const config = CAMPI_PER_TIPO_VEICOLO[tipoVeicolo];
  return config ? !!config[campo] : false;
};

// Classi ambientali Euro (allineate al tariffario Lombardia 2026)
// Nota: Il tariffario raggruppa Euro 4-5-6 per la tariffa, ma qui registriamo la classe effettiva del veicolo
export const CLASSI_AMBIENTALI = [
  'Euro 0',
  'Euro 1',
  'Euro 2',
  'Euro 3',
  'Euro 4',
  'Euro 5',
  'Euro 5a',
  'Euro 5b',
  'Euro 6',
  'Euro 6a',
  'Euro 6b',
  'Euro 6c',
  'Euro 6d-TEMP',
  'Euro 6d',
  'Euro 6d-ISC',
  'Euro 6d-ISC-FCM',
  'Euro 6e',
  'Euro 7',
] as const;

export type ClasseAmbientale = typeof CLASSI_AMBIENTALI[number];

// Mapping classe Euro -> categoria tariffaria (per calcolo bollo autovetture)
export const CATEGORIA_TARIFFARIA_AUTOVETTURE: Record<string, string> = {
  'Euro 0': 'Euro 0',
  'Euro 1': 'Euro 1',
  'Euro 2': 'Euro 2',
  'Euro 3': 'Euro 3',
  'Euro 4': 'Euro 4-5-6',
  'Euro 5': 'Euro 4-5-6',
  'Euro 5a': 'Euro 4-5-6',
  'Euro 5b': 'Euro 4-5-6',
  'Euro 6': 'Euro 4-5-6',
  'Euro 6a': 'Euro 4-5-6',
  'Euro 6b': 'Euro 4-5-6',
  'Euro 6c': 'Euro 4-5-6',
  'Euro 6d-TEMP': 'Euro 4-5-6',
  'Euro 6d': 'Euro 4-5-6',
  'Euro 6d-ISC': 'Euro 4-5-6',
  'Euro 6d-ISC-FCM': 'Euro 4-5-6',
  'Euro 6e': 'Euro 4-5-6',
  'Euro 7': 'Euro 4-5-6',
};

// Mapping classe Euro -> categoria tariffaria (per calcolo bollo motocicli)
export const CATEGORIA_TARIFFARIA_MOTOCICLI: Record<string, string> = {
  'Euro 0': 'Euro 0',
  'Euro 1': 'Euro 1',
  'Euro 2': 'Euro 2',
  'Euro 3': 'Euro 3 e successivi',
  'Euro 4': 'Euro 3 e successivi',
  'Euro 5': 'Euro 3 e successivi',
  'Euro 5a': 'Euro 3 e successivi',
  'Euro 5b': 'Euro 3 e successivi',
  'Euro 6': 'Euro 3 e successivi',
  'Euro 6a': 'Euro 3 e successivi',
  'Euro 6b': 'Euro 3 e successivi',
  'Euro 6c': 'Euro 3 e successivi',
  'Euro 6d-TEMP': 'Euro 3 e successivi',
  'Euro 6d': 'Euro 3 e successivi',
  'Euro 6d-ISC': 'Euro 3 e successivi',
  'Euro 6d-ISC-FCM': 'Euro 3 e successivi',
  'Euro 6e': 'Euro 3 e successivi',
  'Euro 7': 'Euro 3 e successivi',
};

export const REGIONI_ITALIANE = [
  'Abruzzo',
  'Basilicata',
  'Calabria',
  'Campania',
  'Emilia-Romagna',
  'Friuli-Venezia Giulia',
  'Lazio',
  'Liguria',
  'Lombardia',
  'Marche',
  'Molise',
  'Piemonte',
  'Puglia',
  'Sardegna',
  'Sicilia',
  'Toscana',
  'Trentino-Alto Adige',
  'Umbria',
  "Valle d'Aosta",
  'Veneto',
] as const;

export const MESI = [
  { value: 1, label: 'Gennaio' },
  { value: 2, label: 'Febbraio' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Aprile' },
  { value: 5, label: 'Maggio' },
  { value: 6, label: 'Giugno' },
  { value: 7, label: 'Luglio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Settembre' },
  { value: 10, label: 'Ottobre' },
  { value: 11, label: 'Novembre' },
  { value: 12, label: 'Dicembre' },
] as const;

export const getMeseLabel = (mese: number): string => {
  return MESI.find(m => m.value === mese)?.label || '';
};
