/**
 * Fuso orario in cui interpretare gli orari dei job pianificati.
 *
 * Il container gira in UTC: senza un fuso esplicito "07:00" significherebbe
 * le 9 d'estate in Italia. Configurabile con APP_FUSO_ORARIO.
 */
export function fusoOrarioApplicazione(): string {
  const fuso = process.env.APP_FUSO_ORARIO || 'Europe/Rome';
  try {
    new Intl.DateTimeFormat('it-IT', { timeZone: fuso });
    return fuso;
  } catch {
    return 'Europe/Rome';
  }
}

/** Interpreta un orario HH:MM, con un valore di riserva se non valido. */
export function leggiOrario(
  valore: string | undefined,
  riserva: string,
): { ora: number; minuti: number } {
  const interpreta = (v: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
    if (!m) return null;
    const ora = parseInt(m[1], 10);
    const minuti = parseInt(m[2], 10);
    return ora <= 23 && minuti <= 59 ? { ora, minuti } : null;
  };
  return (valore && interpreta(valore)) || interpreta(riserva)!;
}

export function formattaOrario({ ora, minuti }: { ora: number; minuti: number }): string {
  return `${String(ora).padStart(2, '0')}:${String(minuti).padStart(2, '0')}`;
}
