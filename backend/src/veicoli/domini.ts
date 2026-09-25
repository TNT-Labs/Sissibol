/**
 * Valori ammessi per i campi a dominio chiuso del veicolo.
 *
 * Sono gli stessi dei vincoli CHECK del database (migrazione
 * 20260922000003_vincoli_dominio_veicoli): un test li confronta con la
 * migrazione. Validarli già nell'API trasforma un errore del database (500,
 * senza spiegazione) in una risposta 400 che dice quale valore è sbagliato.
 */

export const TIPI_VEICOLO = [
  'Autovettura', 'Autoveicolo uso promiscuo', 'Autobus', 'Autocarro',
  'Autotreno', 'Autoarticolato', 'Trattore stradale', 'Autoveicolo speciale',
  'Autocaravan', 'Motociclo', 'Ciclomotore', 'Motocarro', 'Motofurgone',
  'Quadriciclo', 'Rimorchio', 'Rimorchio speciale', 'Semirimorchio',
  'Rimorchio trasporto persone', 'Macchina agricola', 'Macchina operatrice',
  // Prodotti dall'import dell'archivio, senza tariffa: da riclassificare.
  // Ammessi per poter modificare gli altri dati di quei veicoli.
  'Motrice', 'Altro',
] as const;

/** Tipi da riclassificare: esistono solo per i dati importati. */
export const TIPI_DA_RICLASSIFICARE = ['Motrice', 'Altro'] as const;

export const CLASSI_AMBIENTALI = [
  'Euro 0', 'Euro 1', 'Euro 2', 'Euro 3', 'Euro 4', 'Euro 5', 'Euro 5a',
  'Euro 5b', 'Euro 6', 'Euro 6a', 'Euro 6b', 'Euro 6c', 'Euro 6d-TEMP',
  'Euro 6d', 'Euro 6d-ISC', 'Euro 6d-ISC-FCM', 'Euro 6e', 'Euro 7',
] as const;

export const ALIMENTAZIONI = [
  'Benzina', 'Diesel', 'GPL', 'Metano', 'Ibrido benzina', 'Ibrido diesel',
  'Elettrico', 'Idrogeno',
] as const;

export const TIPI_SOSPENSIONE = ['Pneumatiche', 'Non pneumatiche'] as const;

export const REGIONI = [
  'Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna',
  'Friuli-Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche',
  'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana',
  'Trentino-Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto',
] as const;

/** Campi del veicolo che entrano nel calcolo del bollo. */
export const CAMPI_CALCOLO = [
  'tipoVeicolo', 'classeAmbientale', 'regione', 'alimentazione', 'potenzaKw',
  'cilindrata', 'portataKg', 'pesoComplessivoKg', 'numeroAssi',
  'tipoSospensione', 'numeroPosti', 'massaRimorchiabileKg', 'dataImmatricolazione',
] as const;
