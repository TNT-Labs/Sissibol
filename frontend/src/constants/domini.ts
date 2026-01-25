// Domini per i campi con valori predefiniti

export const TIPI_VEICOLO = [
  'Autocarro',
  'Autotreno',
  'Autoarticolato',
  'Trattore stradale',
  'Rimorchio',
  'Semirimorchio',
  'Autobus',
  'Autovettura',
  'Motociclo',
  'Ciclomotore',
  'Quadriciclo',
  'Macchina agricola',
  'Macchina operatrice',
] as const;

export const CLASSI_AMBIENTALI = [
  'Euro 0',
  'Euro 1',
  'Euro 2',
  'Euro 3',
  'Euro 4',
  'Euro 5',
  'Euro 5b',
  'Euro 6',
  'Euro 6b',
  'Euro 6c',
  'Euro 6d',
  'Euro 6d-TEMP',
  'Euro 7',
  'Elettrico',
  'Ibrido',
] as const;

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
