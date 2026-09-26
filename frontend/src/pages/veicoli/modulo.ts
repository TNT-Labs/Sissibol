import { CAMPI_PER_TIPO_VEICOLO, shouldShowField } from '../../constants/domini';
import type { DatiVeicolo } from '../../services/veicoli.service';
import type { Veicolo } from '../../types';
import { interpreta, opzioniAssegnabili } from '../dati-veicoli/campi';

/** Campi tecnici mostrati solo per i tipi di veicolo che li usano. */
export const CAMPI_TECNICI = [
  'potenzaKw',
  'cilindrata',
  'portataKg',
  'pesoComplessivoKg',
  'numeroAssi',
  'tipoSospensione',
  'numeroPosti',
  'massaRimorchiabileKg',
] as const;

type CampoTecnico = (typeof CAMPI_TECNICI)[number];

const CAMPI_NUMERICI = [
  'potenzaKw',
  'cilindrata',
  'portataKg',
  'pesoComplessivoKg',
  'numeroAssi',
  'numeroPosti',
  'massaRimorchiabileKg',
] as const;

export interface ModuloVeicolo {
  idCliente: number | null;
  targa: string;
  tipoVeicolo: string;
  classeAmbientale: string;
  regione: string;
  alimentazione: string;
  potenzaKw: string;
  cilindrata: string;
  portataKg: string;
  pesoComplessivoKg: string;
  numeroAssi: string;
  tipoSospensione: string;
  numeroPosti: string;
  massaRimorchiabileKg: string;
  dataImmatricolazione: string;
  note: string;
}

export type ErroriModulo = Partial<Record<keyof ModuloVeicolo, string>>;

/** Nuovo veicolo: nessun cliente preselezionato (prima era il primo dell'elenco). */
export const MODULO_VUOTO: ModuloVeicolo = {
  idCliente: null,
  targa: '',
  tipoVeicolo: '',
  classeAmbientale: '',
  regione: '',
  alimentazione: '',
  potenzaKw: '',
  cilindrata: '',
  portataKg: '',
  pesoComplessivoKg: '',
  numeroAssi: '',
  tipoSospensione: '',
  numeroPosti: '',
  massaRimorchiabileKg: '',
  dataImmatricolazione: '',
  note: '',
};

const testo = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));
// Numeri come si scrivono in italiano: "85,5".
const numero = (v: number | string | null | undefined) => testo(v).replace('.', ',');

export function daVeicolo(v: Veicolo): ModuloVeicolo {
  return {
    idCliente: v.idCliente,
    targa: v.targa,
    tipoVeicolo: testo(v.tipoVeicolo),
    classeAmbientale: testo(v.classeAmbientale),
    regione: testo(v.regione),
    alimentazione: testo(v.alimentazione),
    potenzaKw: numero(v.potenzaKw),
    cilindrata: numero(v.cilindrata),
    portataKg: numero(v.portataKg),
    pesoComplessivoKg: numero(v.pesoComplessivoKg),
    numeroAssi: numero(v.numeroAssi),
    tipoSospensione: testo(v.tipoSospensione),
    numeroPosti: numero(v.numeroPosti),
    massaRimorchiabileKg: numero(v.massaRimorchiabileKg),
    dataImmatricolazione: v.dataImmatricolazione?.slice(0, 10) ?? '',
    note: testo(v.note),
  };
}

/** Il tipo di veicolo cambia: i campi tecnici che non gli servono si svuotano. */
export function cambiaTipo(modulo: ModuloVeicolo, tipoVeicolo: string): ModuloVeicolo {
  const dopo = { ...modulo, tipoVeicolo };
  for (const campo of CAMPI_TECNICI) {
    if (!shouldShowField(tipoVeicolo, campo)) dopo[campo] = '';
  }
  return dopo;
}

export const campiTecniciVisibili = (tipoVeicolo: string): CampoTecnico[] =>
  CAMPI_TECNICI.filter((campo) => shouldShowField(tipoVeicolo, campo));

/** Targa come la scrive il libretto: maiuscole, senza spazi. */
export const normalizzaTarga = (targa: string) => targa.replace(/\s+/g, '').toUpperCase();

/**
 * Opzioni di una scelta: solo i valori che il server accetta (prima si poteva
 * scrivere un valore libero, poi rifiutato). Il valore già registrato resta
 * fra le opzioni anche se fuori elenco (tipi importati da riclassificare).
 */
export function opzioniCampo(campo: string, attuale: string): string[] {
  const opzioni = [...opzioniAssegnabili(campo)];
  if (attuale && !opzioni.includes(attuale)) opzioni.push(attuale);
  return opzioni;
}

/** È un tipo senza tariffa? (compare nell'elenco solo se già registrato) */
export const tipoSenzaTariffa = (tipo: string) => tipo !== '' && !CAMPI_PER_TIPO_VEICOLO[tipo];

/**
 * Dati da inviare, oppure gli errori da mostrare sotto i campi.
 * In modifica un campo svuotato si invia come null (altrimenti il valore
 * precedente resterebbe); in creazione si omette.
 */
export function versoApi(
  modulo: ModuloVeicolo,
  /** Veicolo in modifica (null: nuovo). */
  originale: Veicolo | null,
): { dati: DatiVeicolo } | { errori: ErroriModulo } {
  const errori: ErroriModulo = {};
  if (!modulo.idCliente) errori.idCliente = 'Scegli il cliente';
  // Una targa non toccata resta com'è: l'archivio ne ha alcune con segni
  // di punteggiatura, che non devono impedire di modificare gli altri dati.
  const invariata = originale !== null && modulo.targa === originale.targa;
  const targa = invariata ? originale.targa : normalizzaTarga(modulo.targa);
  if (!targa) errori.targa = 'Inserisci la targa';
  else if (!invariata && !/^[A-Z0-9]{2,10}$/.test(targa)) errori.targa = 'Solo lettere e numeri, da 2 a 10 caratteri';

  const vuoto = originale ? null : undefined;
  const numeri: Partial<Record<(typeof CAMPI_NUMERICI)[number], number | null | undefined>> = {};
  for (const campo of CAMPI_NUMERICI) {
    const esito = interpreta(campo, modulo[campo]);
    if ('errore' in esito) errori[campo] = esito.errore;
    else numeri[campo] = (esito.valore as number | null) ?? vuoto;
  }
  if (Object.keys(errori).length > 0) return { errori };

  const scelta = (v: string) => v || vuoto;
  return {
    dati: {
      idCliente: modulo.idCliente!,
      targa,
      tipoVeicolo: scelta(modulo.tipoVeicolo),
      classeAmbientale: scelta(modulo.classeAmbientale),
      regione: scelta(modulo.regione),
      alimentazione: scelta(modulo.alimentazione),
      tipoSospensione: scelta(modulo.tipoSospensione),
      dataImmatricolazione: scelta(modulo.dataImmatricolazione),
      note: modulo.note.trim() || vuoto,
      ...numeri,
    },
  };
}
