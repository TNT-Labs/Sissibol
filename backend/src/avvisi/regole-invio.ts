/**
 * Regole dell'invio degli avvisi: funzioni pure, testabili senza database né
 * server di posta.
 */

/** Tentativi massimi per gli errori temporanei del server di posta. */
export const MAX_TENTATIVI = 3;

/** Attesa prima del tentativo successivo, per numero di tentativi falliti. */
export const ATTESE_RITENTATIVO_MINUTI = [60, 360];

/**
 * Dopo quanto un avviso rimasto IN_INVIO si considera abbandonato da un invio
 * interrotto (riavvio, crash). Ampio rispetto alla durata di una spedizione.
 */
export const MINUTI_INVIO_ABBANDONATO = 15;

export const MESSAGGIO_ESITO_INCERTO =
  'Invio interrotto: non è certo che l\'email sia partita. Verificare con il cliente prima di rimetterlo in coda.';

// Volutamente semplice: serve a scartare valori palesemente non utilizzabili
// (testo libero, numeri di telefono), non a validare ogni sfumatura RFC 5322.
const FORMATO_EMAIL = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;

/**
 * Indirizzi utilizzabili da un campo email del cliente.
 * L'archivio storico può contenere più indirizzi separati da virgola, punto e
 * virgola o spazi: vengono usati tutti, senza duplicati.
 */
export function estraiRecapiti(email: string | null | undefined): string[] {
  if (!email) return [];
  const visti = new Set<string>();
  const recapiti: string[] = [];
  for (const parte of email.split(/[;,\s]+/)) {
    const indirizzo = parte.trim();
    if (!FORMATO_EMAIL.test(indirizzo)) continue;
    const chiave = indirizzo.toLowerCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    recapiti.push(indirizzo);
  }
  return recapiti;
}

export interface AvvisoDaValutare {
  tipo: 'PRIMO' | 'SECONDO' | 'SOLLECITO';
  scadenza: {
    stato: string;
    dataScadenza: Date;
    /** Tutti gli avvisi della scadenza, compreso quello valutato */
    avvisi: Array<{ tipo: string; esito: string }>;
    veicolo: {
      attivo: boolean;
      cliente: { attivo: boolean; avvisiEmail: boolean; email: string | null };
    };
  };
}

export type Decisione =
  | { azione: 'INVIA'; recapiti: string[] }
  | { azione: 'ANNULLA'; motivo: string }
  | { azione: 'ERRORE'; motivo: string };

/**
 * Primo e secondo avviso maturati insieme (sistema attivato a ridosso della
 * scadenza, invio fermo per giorni): il cliente riceve un solo avviso, il
 * primo, con il testo normale. Mandargli un "secondo avviso" senza che abbia
 * mai ricevuto il primo sarebbe falso.
 */
export const MOTIVO_ASSORBITO = 'Assorbito dal primo avviso, maturato a ridosso della scadenza';

const IN_CODA = new Set(['DA_INVIARE', 'IN_INVIO']);

/**
 * Se l'avviso va presentato al cliente come secondo: solo se il primo gli è
 * stato davvero inviato (anche dall'archivio storico).
 */
export function eSecondoPerIlCliente(
  tipo: string,
  avvisiScadenza: Array<{ tipo: string; esito: string }>,
): boolean {
  return (
    tipo === 'SECONDO' &&
    avvisiScadenza.some((a) => a.tipo === 'PRIMO' && a.esito === 'INVIATO')
  );
}

/**
 * Decide, al momento dell'invio, se un avviso maturato va ancora spedito.
 *
 * Fra la maturazione e l'invio possono passare giorni (invio automatico
 * spento, server di posta irraggiungibile): la scadenza può essere stata
 * pagata, il veicolo venduto, il cliente può aver chiesto di non essere più
 * avvisato. Avvisarlo comunque sarebbe un errore verso il cliente.
 *
 * @param oggi - Data odierna a mezzanotte UTC, come le colonne DATE
 */
export function valutaAvviso(avviso: AvvisoDaValutare, oggi: Date): Decisione {
  const { scadenza } = avviso;
  const { veicolo } = scadenza;
  const { cliente } = veicolo;

  if (scadenza.stato === 'PAGATO') {
    return { azione: 'ANNULLA', motivo: 'Scadenza già pagata' };
  }
  if (scadenza.stato === 'SCADUTO' || scadenza.dataScadenza.getTime() < oggi.getTime()) {
    return { azione: 'ANNULLA', motivo: 'Scadenza superata prima dell\'invio' };
  }
  if (!veicolo.attivo) {
    return { azione: 'ANNULLA', motivo: 'Veicolo disattivato' };
  }
  if (!cliente.attivo) {
    return { azione: 'ANNULLA', motivo: 'Cliente disattivato' };
  }
  if (!cliente.avvisiEmail) {
    return { azione: 'ANNULLA', motivo: 'Il cliente non riceve avvisi via email' };
  }
  // Un solo avviso alla volta per scadenza: il secondo attende che il primo
  // sia partito, e se il primo è ancora in coda lo assorbe.
  if (
    avviso.tipo === 'SECONDO' &&
    scadenza.avvisi.some((a) => a.tipo === 'PRIMO' && IN_CODA.has(a.esito))
  ) {
    return { azione: 'ANNULLA', motivo: MOTIVO_ASSORBITO };
  }
  // Un primo avviso rimesso in coda dopo che il secondo è partito arriverebbe
  // al cliente fuori ordine.
  if (
    avviso.tipo === 'PRIMO' &&
    scadenza.avvisi.some((a) => a.tipo === 'SECONDO' && a.esito === 'INVIATO')
  ) {
    return { azione: 'ANNULLA', motivo: 'Il cliente ha già ricevuto il secondo avviso' };
  }

  const recapiti = estraiRecapiti(cliente.email);
  if (recapiti.length === 0) {
    return {
      azione: 'ERRORE',
      motivo: 'Recapito email del cliente mancante o non valido',
    };
  }

  return { azione: 'INVIA', recapiti };
}

export type CategoriaErrore = 'SISTEMICO' | 'TEMPORANEO' | 'PERMANENTE';

export interface ErroreClassificato {
  categoria: CategoriaErrore;
  messaggio: string;
}

// Errori del collegamento o della configurazione: colpiscono ogni messaggio,
// quindi l'invio va fermato senza consumare i tentativi dei singoli avvisi.
const CODICI_SISTEMICI = new Set([
  'EAUTH',
  'ECONNECTION',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'ETLS',
  'ECONFIG',
  'EPROXY',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

// 421: servizio non disponibile; 454: autenticazione temporaneamente
// impossibile; 530/534/535/538: autenticazione rifiutata.
const RISPOSTE_SISTEMICHE = new Set([421, 454, 530, 534, 535, 538]);

/**
 * Classifica un errore di spedizione:
 * - SISTEMICO: server o credenziali; si interrompe l'invio e si riprova dopo.
 * - TEMPORANEO: il destinatario non è raggiungibile ora (4xx); si ritenta.
 * - PERMANENTE: il destinatario rifiuta (5xx, indirizzo inesistente); serve
 *   un intervento, ritentare non cambierebbe l'esito.
 */
export function classificaErroreInvio(errore: unknown): ErroreClassificato {
  const e = (errore ?? {}) as {
    code?: string;
    responseCode?: number;
    response?: string;
    message?: string;
  };
  const codiceRisposta = typeof e.responseCode === 'number' ? e.responseCode : null;
  const dettaglio = (e.response || e.message || String(errore)).trim();
  const messaggio = (codiceRisposta && !dettaglio.startsWith(String(codiceRisposta))
    ? `${codiceRisposta} ${dettaglio}`
    : dettaglio
  ).slice(0, 1000);

  let categoria: CategoriaErrore;
  if ((e.code && CODICI_SISTEMICI.has(e.code)) || (codiceRisposta && RISPOSTE_SISTEMICHE.has(codiceRisposta))) {
    categoria = 'SISTEMICO';
  } else if (codiceRisposta && codiceRisposta >= 500) {
    categoria = 'PERMANENTE';
  } else if (codiceRisposta && codiceRisposta >= 400) {
    categoria = 'TEMPORANEO';
  } else if (e.code === 'EENVELOPE') {
    categoria = 'PERMANENTE';
  } else {
    categoria = 'TEMPORANEO';
  }

  return { categoria, messaggio };
}

/** Momento del prossimo tentativo dopo `tentativi` fallimenti. */
export function prossimoTentativo(tentativi: number, adesso: Date): Date {
  const indice = Math.min(Math.max(tentativi, 1), ATTESE_RITENTATIVO_MINUTI.length) - 1;
  return new Date(adesso.getTime() + ATTESE_RITENTATIVO_MINUTI[indice] * 60_000);
}

/** Data odierna a mezzanotte UTC, come la normalizza ScadenzeService. */
export function oggiNormalizzato(adesso: Date = new Date()): Date {
  return new Date(Date.UTC(adesso.getFullYear(), adesso.getMonth(), adesso.getDate()));
}
