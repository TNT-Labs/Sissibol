import type { StatoBackup } from './stato-backup';

/**
 * Quando avvisare lo studio che i backup non funzionano.
 *
 * Funzione pura, senza orologio né posta: riceve la valutazione attuale e
 * ciò che è stato già comunicato, e decide se spedire qualcosa. Le regole:
 * - al primo problema (ERRORE o ATTENZIONE) un allarme;
 * - se il problema continua, un promemoria al massimo ogni 24 ore: un solo
 *   messaggio può perdersi, uno ogni mezz'ora verrebbe ignorato;
 * - se il problema si aggrava (da ATTENZIONE a ERRORE) un nuovo allarme;
 * - quando tutto torna regolare, un messaggio di ripristino.
 */

export const ORE_FRA_PROMEMORIA = 24;

export type TipoAvviso = 'ALLARME' | 'PROMEMORIA' | 'RIPRISTINO';

/** Ultimo problema comunicato; null se tutto era regolare. */
export interface ProblemaComunicato {
  livello: 'ERRORE' | 'ATTENZIONE';
  inviatoIl: Date;
}

export interface Decisione {
  avviso: TipoAvviso | null;
  /** Da conservare per il prossimo controllo (solo se l'avviso parte davvero). */
  dopo: ProblemaComunicato | null;
}

export function decidiAvviso(
  valutazione: Pick<StatoBackup, 'livello'>,
  comunicato: ProblemaComunicato | null,
  adesso: Date,
): Decisione {
  const { livello } = valutazione;

  // Backup non configurati (sviluppo): nulla da sorvegliare.
  if (livello === 'NON_CONFIGURATO') return { avviso: null, dopo: null };

  if (livello === 'OK') {
    return comunicato ? { avviso: 'RIPRISTINO', dopo: null } : { avviso: null, dopo: null };
  }

  if (!comunicato || (comunicato.livello === 'ATTENZIONE' && livello === 'ERRORE')) {
    return { avviso: 'ALLARME', dopo: { livello, inviatoIl: adesso } };
  }

  const ore = (adesso.getTime() - comunicato.inviatoIl.getTime()) / 3_600_000;
  if (ore >= ORE_FRA_PROMEMORIA) {
    return { avviso: 'PROMEMORIA', dopo: { livello, inviatoIl: adesso } };
  }
  // Già comunicato di recente. Se è migliorato (da ERRORE ad ATTENZIONE)
  // si ricorda il livello attuale, così un nuovo peggioramento riavvisa.
  return { avviso: null, dopo: { livello, inviatoIl: comunicato.inviatoIl } };
}

// ---------------------------------------------------------------------------
// Testo del messaggio
// ---------------------------------------------------------------------------

export interface MessaggioAvviso {
  oggetto: string;
  testo: string;
}

function quando(iso: string, fuso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'full', timeStyle: 'short', timeZone: fuso }).format(data);
}

/** Testo semplice: deve leggersi bene su qualsiasi programma di posta. */
export function componiAvviso(tipo: TipoAvviso, stato: StatoBackup, fuso: string): MessaggioAvviso {
  const righe: string[] = [];
  if (tipo === 'RIPRISTINO') {
    righe.push('I backup di Sissibol funzionano di nuovo regolarmente.');
  } else {
    righe.push(
      tipo === 'PROMEMORIA'
        ? 'Promemoria: il problema con i backup di Sissibol non è ancora risolto.'
        : 'Attenzione: i backup di Sissibol non funzionano come dovrebbero.',
    );
    righe.push('', stato.messaggio);
  }

  righe.push('');
  righe.push(
    stato.ultimoRiuscito
      ? `Ultimo backup riuscito: ${quando(stato.ultimoRiuscito.quando, fuso)} (${stato.ultimoRiuscito.file}).`
      : 'Nessun backup riuscito disponibile.',
  );
  if (stato.ultimoTentativo && tipo !== 'RIPRISTINO') {
    righe.push(`Ultimo tentativo: ${quando(stato.ultimoTentativo.quando, fuso)}, esito ${stato.ultimoTentativo.esito}.`);
    if (stato.ultimoTentativo.errore) righe.push(`Errore: ${stato.ultimoTentativo.errore}`);
  }

  if (tipo !== 'RIPRISTINO') {
    righe.push(
      '',
      'Cosa fare:',
      '- controllare lo stato nella dashboard di Sissibol (sezione "Stato del sistema");',
      '- sul server: "make backup-stato" e "docker compose logs backup";',
      '- provare un backup a mano con "make backup" (vedi BACKUP.md).',
      '',
      'Finché il problema resta, riceverai un promemoria ogni 24 ore.',
    );
  }
  righe.push('', '— Sissibol (messaggio automatico)');

  const oggetto =
    tipo === 'RIPRISTINO'
      ? 'Sissibol: backup di nuovo regolari'
      : `Sissibol: ${stato.livello === 'ERRORE' ? 'backup non riusciti' : 'ultimo backup non riuscito'}${tipo === 'PROMEMORIA' ? ' (promemoria)' : ''}`;
  return { oggetto, testo: righe.join('\n') };
}
