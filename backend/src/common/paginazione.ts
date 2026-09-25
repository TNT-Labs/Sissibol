/**
 * Pagina e dimensione della pagina richieste dal client, rese sicure.
 *
 * Senza un limite, `pageSize=1000000` restituiva l'intero archivio in una sola
 * risposta (oltre 120.000 scadenze con veicolo e cliente): un modo semplice
 * per esaurire la memoria del server. Valori non numerici o fuori intervallo
 * (che prima producevano un errore 500) diventano i valori predefiniti.
 */

export const DIMENSIONE_MASSIMA_PAGINA = 200;

export function paginazioneSicura(
  pagina: unknown,
  dimensione: unknown,
  dimensionePredefinita: number,
): { page: number; pageSize: number } {
  const p = Number(pagina);
  const d = Number(dimensione);
  return {
    page: Number.isInteger(p) && p >= 1 ? p : 1,
    pageSize:
      Number.isInteger(d) && d >= 1 ? Math.min(d, DIMENSIONE_MASSIMA_PAGINA) : dimensionePredefinita,
  };
}
