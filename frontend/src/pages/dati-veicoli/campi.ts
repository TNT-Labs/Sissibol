import {
  CLASSI_AMBIENTALI,
  REGIONI_ITALIANE,
  TIPI_ALIMENTAZIONE,
  TIPI_SOSPENSIONE,
  TIPI_VEICOLO,
} from '../../constants/domini';

/** Come si inserisce ciascun dato di calcolo del veicolo. */
export type DefinizioneCampo =
  | { tipo: 'scelta'; etichetta: string; opzioni: readonly string[] }
  | { tipo: 'numero'; etichetta: string; unita: string; decimali: boolean }
  | { tipo: 'data'; etichetta: string };

export const CAMPI: Record<string, DefinizioneCampo> = {
  tipoVeicolo: { tipo: 'scelta', etichetta: 'Tipo di veicolo', opzioni: TIPI_VEICOLO },
  classeAmbientale: { tipo: 'scelta', etichetta: 'Classe ambientale', opzioni: CLASSI_AMBIENTALI },
  alimentazione: { tipo: 'scelta', etichetta: 'Alimentazione', opzioni: TIPI_ALIMENTAZIONE },
  regione: { tipo: 'scelta', etichetta: 'Regione', opzioni: REGIONI_ITALIANE },
  tipoSospensione: { tipo: 'scelta', etichetta: 'Sospensioni', opzioni: TIPI_SOSPENSIONE },
  potenzaKw: { tipo: 'numero', etichetta: 'Potenza', unita: 'kW', decimali: true },
  cilindrata: { tipo: 'numero', etichetta: 'Cilindrata', unita: 'cc', decimali: false },
  portataKg: { tipo: 'numero', etichetta: 'Portata', unita: 'kg', decimali: false },
  pesoComplessivoKg: { tipo: 'numero', etichetta: 'Peso complessivo', unita: 'kg', decimali: false },
  numeroAssi: { tipo: 'numero', etichetta: 'Numero di assi', unita: '', decimali: false },
  numeroPosti: { tipo: 'numero', etichetta: 'Numero di posti', unita: '', decimali: false },
  massaRimorchiabileKg: { tipo: 'numero', etichetta: 'Massa rimorchiabile', unita: 'kg', decimali: false },
  dataImmatricolazione: { tipo: 'data', etichetta: 'Data di immatricolazione' },
};

/** Campi impostabili su più veicoli insieme. */
export const CAMPI_MULTIPLI = [
  'tipoVeicolo',
  'classeAmbientale',
  'alimentazione',
  'regione',
  'tipoSospensione',
] as const;

/** Tipi dell'archivio da riclassificare: non si assegnano. */
const DA_RICLASSIFICARE = ['Motrice', 'Altro'];

export const opzioniAssegnabili = (campo: string): readonly string[] => {
  const def = CAMPI[campo];
  if (!def || def.tipo !== 'scelta') return [];
  return def.opzioni.filter((o) => !DA_RICLASSIFICARE.includes(o));
};

/**
 * Converte il valore inserito in quello da inviare. Restituisce un errore
 * leggibile invece di lasciar rifiutare il dato dal server.
 */
export function interpreta(
  campo: string,
  testo: string,
): { valore: string | number | null } | { errore: string } {
  const def = CAMPI[campo];
  const t = testo.trim();
  if (!def || t === '') return { valore: null };
  if (def.tipo !== 'numero') return { valore: t };

  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) {
    return { errore: `${def.etichetta}: inserire un numero maggiore di zero` };
  }
  if (!def.decimali && !Number.isInteger(n)) {
    return { errore: `${def.etichetta}: inserire un numero intero` };
  }
  return { valore: n };
}
