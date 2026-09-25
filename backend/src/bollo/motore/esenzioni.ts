/**
 * Valutazione dichiarativa delle esenzioni e riduzioni.
 *
 * Ogni esenzione ha dei criteri; si applica solo se TUTTI quelli dichiarati
 * sono soddisfatti. Tre esiti possibili per ciascuna:
 *
 * - APPLICABILE: i criteri sono tutti verificati;
 * - NON_APPLICABILE: almeno un criterio è sicuramente falso;
 * - NON_VALUTABILE: manca un dato per verificarlo.
 *
 * POLITICA SUI DATI MANCANTI. Un beneficio che dipende da un dato mancante non
 * viene concesso: il calcolo prosegue senza, e lo dichiara fra le assunzioni.
 * Il motore precedente faceva il contrario per gli elettrici (senza data di
 * immatricolazione assumeva "0 anni" e li esentava), con il rischio di far
 * risultare esente un veicolo che non lo è.
 *
 * POLITICA DI CUMULO. Fra più riduzioni parziali applicabili si applica
 * la sola più vantaggiosa. È l'intento dichiarato nel motore precedente
 * ("priorità all'esenzione più vantaggiosa", "evita di applicare
 * ultratrentennale se già applicata esenzione per alimentazione"), che però
 * dipendeva dall'ordine di valutazione: una vettura GPL ultratrentennale si
 * vedeva cumulare 50% + 25%, un'elettrica ultratrentennale no. Se la
 * normativa prevedesse il cumulo, va cambiata solo `POLITICA_CUMULO`.
 */

import { EsenzioneApplicata, EsenzioneInput, VeicoloInput } from './tipi';
import { anniCompiuti, dec, Dec } from './numeri';

export const POLITICA_CUMULO: 'SOLO_PIU_VANTAGGIOSA' = 'SOLO_PIU_VANTAGGIOSA';

type Valutazione =
  | { stato: 'APPLICABILE'; motivo: string }
  | { stato: 'NON_APPLICABILE' }
  | { stato: 'NON_VALUTABILE'; campo: 'alimentazione' | 'dataImmatricolazione' };

/**
 * Criteri di una singola esenzione.
 *
 * `anniDaImmatricolazione` ha due significati, ereditati dallo schema:
 * - con un'alimentazione è un periodo di validità: "elettrico esente per i
 *   primi 5 anni" vale finché il veicolo non ha compiuto 5 anni. Il motore
 *   precedente usava `anni <= 5`, concedendo di fatto un sesto anno: un
 *   veicolo di 5 anni e un giorno risultava esente, mentre la riduzione
 *   parziale configurata si chiama "elettrici OLTRE i 5 anni";
 * - da solo è una soglia minima: "ultratrentennali" dal trentesimo anno.
 */
function valuta(
  e: EsenzioneInput,
  v: VeicoloInput,
  dataRiferimento: string,
): Valutazione {
  // Prima i criteri che possono essere sicuramente falsi: se uno lo è, la
  // mancanza di altri dati è irrilevante.
  if (e.tipoVeicolo !== null && v.tipoVeicolo !== e.tipoVeicolo) {
    return { stato: 'NON_APPLICABILE' };
  }
  if (e.alimentazione !== null && v.alimentazione !== null && v.alimentazione !== e.alimentazione) {
    return { stato: 'NON_APPLICABILE' };
  }

  const anni = v.dataImmatricolazione
    ? anniCompiuti(v.dataImmatricolazione, dataRiferimento)
    : null;

  if (e.anniDaImmatricolazione !== null && anni !== null) {
    const entroPeriodo =
      e.alimentazione !== null
        ? anni < e.anniDaImmatricolazione // periodo di validità
        : anni >= e.anniDaImmatricolazione; // soglia minima
    if (!entroPeriodo) return { stato: 'NON_APPLICABILE' };
  }

  // Poi i dati mancanti.
  if (e.alimentazione !== null && v.alimentazione === null) {
    return { stato: 'NON_VALUTABILE', campo: 'alimentazione' };
  }
  if (e.anniDaImmatricolazione !== null && anni === null) {
    return { stato: 'NON_VALUTABILE', campo: 'dataImmatricolazione' };
  }

  // Tutti i criteri dichiarati sono verificati. Il motivo riprende i testi
  // del motore precedente, che compaiono nei report e negli snapshot.
  let motivo: string;
  if (e.alimentazione !== null && e.anniDaImmatricolazione !== null) {
    motivo = `Veicolo ${e.alimentazione.toLowerCase()} (${anni} anni dall'immatricolazione)`;
  } else if (e.alimentazione !== null) {
    motivo = `Alimentazione: ${e.alimentazione}`;
  } else if (e.anniDaImmatricolazione !== null) {
    motivo = `Veicolo storico (${anni} anni, soglia: ${e.anniDaImmatricolazione})`;
  } else if (e.tipoVeicolo !== null) {
    motivo = `Tipo veicolo: ${e.tipoVeicolo}`;
  } else {
    motivo = 'Esenzione generale';
  }

  return { stato: 'APPLICABILE', motivo };
}

/** Beneficio di un'esenzione, per confrontarle: una totale vale 100. */
function beneficio(e: EsenzioneInput): Dec {
  if (e.tipoEsenzione === 'TOTALE') return dec(100);
  return e.percentualeRiduzione === null ? dec(0) : dec(e.percentualeRiduzione);
}

export interface EsitoEsenzioni {
  /** Esenzione totale applicabile, se c'è */
  totale: EsenzioneApplicata | null;
  /** Riduzione parziale da applicare, se c'è */
  parziale: EsenzioneApplicata | null;
  /** Benefici non valutati per dati mancanti, uno per campo */
  assunzioni: string[];
}

const TESTO_ASSUNZIONE: Record<'alimentazione' | 'dataImmatricolazione', string> = {
  alimentazione:
    'Alimentazione non indicata: le esenzioni e riduzioni legate all\'alimentazione non sono state valutate né applicate.',
  dataImmatricolazione:
    'Data di immatricolazione non indicata: le esenzioni e riduzioni legate all\'anzianità del veicolo non sono state valutate né applicate.',
};

export function valutaEsenzioni(
  veicolo: VeicoloInput,
  esenzioni: EsenzioneInput[],
  dataRiferimento: string,
): EsitoEsenzioni {
  const applicabili: Array<{ e: EsenzioneInput; motivo: string }> = [];
  const nonValutabili: Array<{ e: EsenzioneInput; campo: 'alimentazione' | 'dataImmatricolazione' }> = [];

  for (const e of esenzioni) {
    const v = valuta(e, veicolo, dataRiferimento);
    if (v.stato === 'APPLICABILE') applicabili.push({ e, motivo: v.motivo });
    if (v.stato === 'NON_VALUTABILE') nonValutabili.push({ e, campo: v.campo });
  }

  // Scelta del beneficio: la totale prevale; fra le parziali la più
  // vantaggiosa; a parità, la prima configurata.
  const ordinate = [...applicabili].sort((a, b) => beneficio(b.e).comparedTo(beneficio(a.e)));
  const migliore = ordinate[0] ?? null;

  const totale =
    migliore && migliore.e.tipoEsenzione === 'TOTALE'
      ? {
          tipo: 'TOTALE' as const,
          descrizione: `${migliore.e.descrizione} (${migliore.motivo})`,
          percentualeRiduzione: null,
        }
      : null;

  const parziale =
    !totale && migliore && migliore.e.tipoEsenzione === 'PARZIALE' && beneficio(migliore.e).greaterThan(0)
      ? {
          tipo: 'PARZIALE' as const,
          descrizione: `${migliore.e.descrizione} (${migliore.motivo})`,
          percentualeRiduzione: beneficio(migliore.e).toString(),
        }
      : null;

  // Un'assunzione va dichiarata solo se il beneficio non valutato avrebbe
  // potuto cambiare il risultato, cioè se supera quello applicato.
  const applicato = migliore ? beneficio(migliore.e) : dec(0);
  const campi = new Set(
    nonValutabili.filter(({ e }) => beneficio(e).greaterThan(applicato)).map(({ campo }) => campo),
  );
  const assunzioni = (['alimentazione', 'dataImmatricolazione'] as const)
    .filter((c) => campi.has(c))
    .map((c) => TESTO_ASSUNZIONE[c]);

  return { totale, parziale, assunzioni };
}
