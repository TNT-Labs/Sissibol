/**
 * Parole di una ricerca libera: ognuna deve comparire in almeno uno dei campi
 * cercati, così "Rossi Mario" o "rossi AB123" trovano quello che ci si aspetta
 * (prima il testo intero veniva cercato in un solo campo e non trovava nulla).
 *
 * Testo limitato a 100 caratteri e 5 parole; un valore che non è una stringa
 * (es. ?search=a&search=b) vale come nessuna ricerca.
 */
export function paroleDiRicerca(testo: unknown): string[] {
  if (typeof testo !== 'string') return [];
  return testo.slice(0, 100).trim().split(/\s+/).filter(Boolean).slice(0, 5);
}
