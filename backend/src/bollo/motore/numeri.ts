/**
 * Aritmetica decimale e fasce del tariffario.
 *
 * Tutti gli importi sono calcolati con decimal.js e arrotondati al centesimo
 * con arrotondamento commerciale (metà verso l'alto). Il motore precedente
 * usava numeri in virgola mobile e `Math.round(x * 100) / 100`, che su alcuni
 * valori sbaglia di un centesimo (1.005 * 100 = 100.49999999999999).
 */

import Decimal from 'decimal.js';

/** Istanza isolata: non altera la configurazione globale di decimal.js. */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;

export const ZERO = new D(0);
export const CENTO = new D(100);

export function dec(valore: string | number): Dec {
  return new D(valore);
}

export function decOpt(valore: string | number | null | undefined): Dec | null {
  return valore === null || valore === undefined ? null : new D(valore);
}

/** Arrotonda al centesimo, metà verso l'alto. */
export function alCentesimo(valore: Dec): Dec {
  return valore.toDecimalPlaces(2, D.ROUND_HALF_UP);
}

/** Importo come stringa a due decimali, per l'output del motore. */
export function euro(valore: Dec): string {
  return alCentesimo(valore).toFixed(2);
}

/**
 * Rappresentazione compatta di una quantità (85, 113.5, 13.5): è quella usata
 * nei testi del dettaglio, identica a come la stampava il motore precedente.
 */
export function quantita(valore: Dec): string {
  return valore.toString();
}

// =====================================================
// FASCE
// =====================================================

/**
 * Estremi di una fascia.
 *
 * Il tariffario non dichiara se gli estremi siano inclusi: la convenzione
 * dipende dalla grandezza, ed è quella storicamente usata dal motore per
 * ciascuna. Qui è resa esplicita invece che sparsa nei confronti.
 *
 *   '[)'  minimo incluso, massimo escluso   (portata, cilindrata, peso)
 *   '(]'  minimo escluso, massimo incluso   (potenza dei motocicli)
 *   '[]'  entrambi inclusi                  (assi, posti: valori interi)
 */
export type Estremi = '[)' | '(]' | '[]';

export interface Fascia {
  min: Dec;
  /** null = illimitata */
  max: Dec | null;
}

export function fasciaDi(t: { sogliaMin: string | null; sogliaMax: string | null }): Fascia {
  return {
    min: t.sogliaMin === null ? ZERO : dec(t.sogliaMin),
    max: t.sogliaMax === null ? null : dec(t.sogliaMax),
  };
}

export function inFascia(valore: Dec, fascia: Fascia, estremi: Estremi): boolean {
  const sopraMin =
    estremi === '(]' ? valore.greaterThan(fascia.min) : valore.greaterThanOrEqualTo(fascia.min);
  if (!sopraMin) return false;
  if (fascia.max === null) return true;
  return estremi === '[)'
    ? valore.lessThan(fascia.max)
    : valore.lessThanOrEqualTo(fascia.max);
}

export function descriviFascia(fascia: Fascia): string {
  return fascia.max === null
    ? `da ${quantita(fascia.min)} in su`
    : `${quantita(fascia.min)}-${quantita(fascia.max)}`;
}

/**
 * Verifica che le fasce di un insieme di righe non si sovrappongano.
 *
 * Il tariffario è modificabile dall'interfaccia: una sovrapposizione
 * introdotta per errore farebbe applicare due tariffe allo stesso scaglione.
 * Restituisce la prima coppia sovrapposta, o null.
 */
export function primaSovrapposizione<T extends { sogliaMin: string | null; sogliaMax: string | null }>(
  righe: T[],
): [T, T] | null {
  const ordinate = [...righe].sort((a, b) => fasciaDi(a).min.comparedTo(fasciaDi(b).min));
  for (let i = 1; i < ordinate.length; i++) {
    const prec = fasciaDi(ordinate[i - 1]);
    const corr = fasciaDi(ordinate[i]);
    if (prec.max === null || prec.max.greaterThan(corr.min)) {
      return [ordinate[i - 1], ordinate[i]];
    }
  }
  return null;
}

// =====================================================
// DATE
// =====================================================

/**
 * Anni compiuti fra due date YYYY-MM-DD.
 *
 * Aritmetica sui soli componenti della data, senza oggetti Date: il risultato
 * non dipende dal fuso orario del server.
 */
export function anniCompiuti(dal: string, al: string): number {
  const [a1, m1, g1] = dal.split('-').map(Number);
  const [a2, m2, g2] = al.split('-').map(Number);
  let anni = a2 - a1;
  if (m2 < m1 || (m2 === m1 && g2 < g1)) anni--;
  return anni;
}
