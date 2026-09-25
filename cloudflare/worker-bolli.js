/**
 * Worker Cloudflare: https://<dominio>/bolli -> tunnel di Sissibol.
 *
 * Serve solo se il dominio principale (es. shopbeautylab.it) ospita già un
 * altro sito, che deve continuare a rispondere su tutti gli altri percorsi.
 * Se il dominio è libero o si usa un sottodominio, basta il tunnel da solo
 * (CLOUDFLARE.md, "Scelta dell'indirizzo").
 *
 * Route del Worker:  shopbeautylab.it/bolli*
 * Variabili:
 *   ORIGINE          indirizzo del tunnel, es. https://sissibol-origine.shopbeautylab.it
 *   SEGRETO_ORIGINE  (secret) lo stesso valore di ORIGINE_SEGRETO nel file .env
 *
 * Il tunnel respinge (403) ogni richiesta senza il segreto: l'indirizzo
 * nascosto non è utilizzabile scavalcando il Worker.
 */

const PREFISSO = '/bolli';
// Il solo cookie dell'applicazione: quelli del sito principale non le servono
// e non devono arrivarle.
const COOKIE_APPLICAZIONE = 'refresh_token';

function appartieneAllApplicazione(percorso) {
  return percorso === PREFISSO || percorso.startsWith(`${PREFISSO}/`);
}

function soloCookieApplicazione(cookie) {
  if (!cookie) return null;
  const nostri = cookie
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c.startsWith(`${COOKIE_APPLICAZIONE}=`));
  return nostri.length ? nostri.join('; ') : null;
}

function richiestaVersoOrigine(richiesta, env) {
  const url = new URL(richiesta.url);
  const destinazione = new URL(url.pathname + url.search, env.ORIGINE);

  const intestazioni = new Headers(richiesta.headers);
  const cookie = soloCookieApplicazione(richiesta.headers.get('Cookie'));
  if (cookie) intestazioni.set('Cookie', cookie);
  else intestazioni.delete('Cookie');

  // Impostate qui e solo qui: un valore inviato dal browser viene sostituito.
  intestazioni.set('X-Sissibol-Origine', env.SEGRETO_ORIGINE);
  intestazioni.set('X-Sissibol-Client-IP', richiesta.headers.get('CF-Connecting-IP') ?? '');

  const conCorpo = !['GET', 'HEAD'].includes(richiesta.method) && richiesta.body !== null;
  return new Request(destinazione, {
    method: richiesta.method,
    headers: intestazioni,
    body: conCorpo ? richiesta.body : null,
    // Corpo inoltrato in streaming (opzione dello standard fetch).
    ...(conCorpo ? { duplex: 'half' } : {}),
    // I redirect (es. /bolli -> /bolli/) arrivano al browser così come sono.
    redirect: 'manual',
  });
}

export default {
  async fetch(richiesta, env) {
    const url = new URL(richiesta.url);
    // La route cattura anche percorsi come /bollino: restano del sito principale.
    if (!appartieneAllApplicazione(url.pathname)) return fetch(richiesta);

    if (!env.ORIGINE || !env.SEGRETO_ORIGINE || env.SEGRETO_ORIGINE.length < 32) {
      return new Response('Sissibol: Worker non configurato (ORIGINE, SEGRETO_ORIGINE).', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    return fetch(richiestaVersoOrigine(richiesta, env));
  },
};
