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

export function formattaImporto(valore: number | string): string {
  return `€ ${Number(valore).toFixed(2)}`;
}

/** Testo e spiegazione mostrati quando l'importo manca. */
export const IMPORTO_MANCANTE = {
  etichetta: 'Da calcolare',
  spiegazione:
    'Bollo non calcolabile: completare i dati del veicolo (tipo, potenza, classe ambientale...) oppure inserire l\'importo a mano.',
};
