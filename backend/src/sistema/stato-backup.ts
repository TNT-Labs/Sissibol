/**
 * Valutazione dello stato dei backup, a partire dal file scritto dal
 * servizio di backup (scripts/backup/backup.sh → /backups/stato.json).
 *
 * Funzione pura: il file viene letto altrove. Un backup che smette di
 * funzionare in silenzio si scopre solo il giorno in cui serve; qui il
 * silenzio stesso (nessuno stato, stato vecchio) è un allarme.
 */

export type LivelloBackup = 'OK' | 'ATTENZIONE' | 'ERRORE' | 'NON_CONFIGURATO';

export interface StatoBackup {
  livello: LivelloBackup;
  messaggio: string;
  ultimoTentativo: { quando: string; esito: string; errore: string | null } | null;
  ultimoRiuscito: { quando: string; file: string; dimensioneByte: number } | null;
  backupConservati: number | null;
  ora: string | null;
}

/** Oltre questo intervallo senza backup riusciti il servizio va considerato fermo. */
export const ORE_MASSIME_SENZA_BACKUP = 30;

interface FileStato {
  esito?: string;
  quando?: string;
  errore?: string | null;
  ultimoRiuscito?: { quando?: string; file?: string; dimensioneByte?: number } | null;
  backupConservati?: number;
  ora?: string;
}

export function valutaBackup(
  contenuto: string | null,
  configurato: boolean,
  adesso: Date = new Date(),
): StatoBackup {
  const vuoto = { ultimoTentativo: null, ultimoRiuscito: null, backupConservati: null, ora: null };

  if (!configurato) {
    return {
      livello: 'NON_CONFIGURATO',
      messaggio: 'Backup automatici non configurati su questa installazione.',
      ...vuoto,
    };
  }
  if (contenuto === null) {
    return {
      livello: 'ERRORE',
      messaggio: 'Nessuno stato dal servizio di backup: il servizio non è attivo o non ha mai completato un tentativo.',
      ...vuoto,
    };
  }

  let stato: FileStato;
  try {
    stato = JSON.parse(contenuto);
  } catch {
    return { livello: 'ERRORE', messaggio: 'Stato dei backup illeggibile.', ...vuoto };
  }

  const riuscito =
    stato.ultimoRiuscito?.quando && stato.ultimoRiuscito.file
      ? {
          quando: stato.ultimoRiuscito.quando,
          file: stato.ultimoRiuscito.file,
          dimensioneByte: Number(stato.ultimoRiuscito.dimensioneByte ?? 0),
        }
      : null;
  const base = {
    ultimoTentativo: stato.quando
      ? { quando: stato.quando, esito: stato.esito ?? '?', errore: stato.errore ?? null }
      : null,
    ultimoRiuscito: riuscito,
    backupConservati: typeof stato.backupConservati === 'number' ? stato.backupConservati : null,
    ora: stato.ora ?? null,
  };

  if (!riuscito) {
    return { livello: 'ERRORE', messaggio: 'Nessun backup riuscito finora.', ...base };
  }

  const ore = (adesso.getTime() - new Date(riuscito.quando).getTime()) / 3_600_000;
  if (!Number.isFinite(ore) || ore > ORE_MASSIME_SENZA_BACKUP) {
    return {
      livello: 'ERRORE',
      messaggio: `Nessun backup riuscito da ${Number.isFinite(ore) ? Math.floor(ore) : '?'} ore.`,
      ...base,
    };
  }
  if (stato.esito !== 'OK') {
    return {
      livello: 'ATTENZIONE',
      messaggio: 'L\'ultimo tentativo di backup non è riuscito; l\'ultimo backup valido è recente.',
      ...base,
    };
  }
  return { livello: 'OK', messaggio: 'Backup regolari.', ...base };
}
