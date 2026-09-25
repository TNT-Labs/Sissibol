/**
 * Politica CORS dell'API.
 *
 * In produzione il frontend e l'API stanno sulla stessa origine: nginx serve
 * l'interfaccia e inoltra /api al backend. Il browser invia comunque
 * l'intestazione Origin sulle richieste POST, anche quando l'origine è la
 * stessa, e una lista di origini consentite che non la comprende bloccava il
 * login (errore 500) in ogni installazione Docker, dove CORS_ORIGINS non
 * veniva passata al backend.
 *
 * Il CORS esiste per le richieste da origini *diverse*: una richiesta dalla
 * stessa origine a cui è indirizzata non va mai rifiutata. Le altre origini
 * restano ammesse solo se elencate in CORS_ORIGINS.
 */

export interface RichiestaCors {
  headers: Record<string, string | string[] | undefined>;
}

function primoValore(valore: string | string[] | undefined): string | undefined {
  const v = Array.isArray(valore) ? valore[0] : valore;
  // X-Forwarded-Host può contenere una catena di proxy: conta il primo.
  return v?.split(',')[0]?.trim() || undefined;
}

/**
 * Se l'origine coincide con l'host a cui la richiesta è indirizzata.
 *
 * nginx inoltra l'host con `$host`, che non riporta la porta: in quel caso si
 * confronta solo il nome host. Se la porta è presente, deve coincidere anche
 * quella.
 */
export function stessaOrigine(origin: string, richiesta: RichiestaCors): boolean {
  const destinazione =
    primoValore(richiesta.headers['x-forwarded-host']) ?? primoValore(richiesta.headers.host);
  if (!destinazione) return false;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  const destinazioneMinuscola = destinazione.toLowerCase();
  const haPorta = /:\d+$/.test(destinazioneMinuscola) && !destinazioneMinuscola.endsWith(']');
  return haPorta
    ? url.host.toLowerCase() === destinazioneMinuscola
    : url.hostname.toLowerCase() === destinazioneMinuscola;
}

export function leggiOriginiConsentite(valore: string | undefined): string[] {
  return valore
    ? valore.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:3001']; // Default per sviluppo
}

/** Decide se una richiesta con questa origine è ammessa. */
export function origineAmmessa(
  origin: string | undefined,
  richiesta: RichiestaCors,
  consentite: string[],
): boolean {
  // Richieste senza Origin: client non browser (curl, app) o navigazione.
  if (!origin) return true;
  if (consentite.includes('*') || consentite.includes(origin)) return true;
  return stessaOrigine(origin, richiesta);
}
