/**
 * Importi in euro nell'interfaccia.
 *
 * Distingue tre casi che prima venivano confusi:
 * - importo presente, anche zero (veicolo esente): si mostra;
 * - importo assente (null): il bollo non è stato calcolato, perché mancano
 *   dati del veicolo o tariffe. Va reso evidente, non nascosto dietro un "-".
 *
 * Il backend serializza i decimali come stringa ("258"), da qui il Number().
 */

export type ImportoApi = number | string | null | undefined;

export function haImporto(valore: ImportoApi): valore is number | string {
  return valore !== null && valore !== undefined && valore !== '';
}

// Formato italiano con separatore delle migliaia sempre ("1.043,45 €"):
// 'always' è standard ma non ancora nei tipi di TypeScript.
const EURO = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always' as unknown as boolean,
});

export function formattaImporto(valore: number | string): string {
  return EURO.format(Number(valore));
}

/** Testo e spiegazione mostrati quando l'importo manca. */
export const IMPORTO_MANCANTE = {
  etichetta: 'Da calcolare',
  spiegazione:
    'Bollo non calcolabile: completare i dati del veicolo (tipo, potenza, classe ambientale...) oppure inserire l\'importo a mano.',
};
