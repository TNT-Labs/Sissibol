// Verifica del Worker con Node:  node --test cloudflare/worker-bolli.test.mjs
// Node ha le stesse API web (Request, Headers, URL) del runtime di Cloudflare;
// fetch è sostituita per osservare la richiesta inoltrata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker-bolli.js';

const env = { ORIGINE: 'https://sissibol-origine.example.it', SEGRETO_ORIGINE: 'a'.repeat(48) };

/** Esegue il Worker e restituisce la richiesta che ha inoltrato. */
async function inoltrata(richiesta, ambiente = env) {
  const originale = globalThis.fetch;
  let catturata = null;
  globalThis.fetch = async (r) => {
    catturata = r;
    return new Response('risposta', { status: 200 });
  };
  try {
    const risposta = await worker.fetch(richiesta, ambiente);
    return { risposta, richiesta: catturata };
  } finally {
    globalThis.fetch = originale;
  }
}

test('inoltra percorso e query all\'origine, con segreto e IP del client', async () => {
  const { richiesta: r } = await inoltrata(
    new Request('https://shopbeautylab.it/bolli/api/clienti?cerca=AB123CD', {
      headers: {
        'CF-Connecting-IP': '198.51.100.7',
        'X-Sissibol-Origine': 'inventato-dal-browser',
        'X-Sissibol-Client-IP': '6.6.6.6',
        Authorization: 'Bearer abc',
      },
    }),
  );
  assert.equal(r.url, 'https://sissibol-origine.example.it/bolli/api/clienti?cerca=AB123CD');
  assert.equal(r.headers.get('X-Sissibol-Origine'), env.SEGRETO_ORIGINE);
  assert.equal(r.headers.get('X-Sissibol-Client-IP'), '198.51.100.7');
  assert.equal(r.headers.get('Authorization'), 'Bearer abc');
  assert.equal(r.redirect, 'manual');
});

test('anche /bolli senza barra finale è dell\'applicazione', async () => {
  const { richiesta: r } = await inoltrata(new Request('https://shopbeautylab.it/bolli'));
  assert.equal(r.url, 'https://sissibol-origine.example.it/bolli');
});

test('i cookie del sito principale non arrivano all\'applicazione', async () => {
  const con = await inoltrata(
    new Request('https://shopbeautylab.it/bolli/api/auth/refresh', {
      method: 'POST',
      headers: { Cookie: 'carrello=1; refresh_token=xyz; _ga=2' },
    }),
  );
  assert.equal(con.richiesta.headers.get('Cookie'), 'refresh_token=xyz');

  const senza = await inoltrata(
    new Request('https://shopbeautylab.it/bolli/', { headers: { Cookie: 'sessione_negozio=segreta' } }),
  );
  assert.equal(senza.richiesta.headers.get('Cookie'), null);
});

test('il corpo delle richieste POST viene inoltrato', async () => {
  const { richiesta: r } = await inoltrata(
    new Request('https://shopbeautylab.it/bolli/api/auth/login', {
      method: 'POST',
      body: '{"email":"a@b.it"}',
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  assert.equal(r.method, 'POST');
  assert.equal(await r.text(), '{"email":"a@b.it"}');
});

test('senza configurazione completa risponde 503 invece di inoltrare', async () => {
  for (const ambiente of [{ ORIGINE: env.ORIGINE }, { ...env, SEGRETO_ORIGINE: 'corto' }]) {
    const { risposta, richiesta } = await inoltrata(new Request('https://shopbeautylab.it/bolli/'), ambiente);
    assert.equal(risposta.status, 503);
    assert.equal(richiesta, null);
  }
});

test('gli altri percorsi (anche /bollino) restano del sito principale, senza segreto', async () => {
  const { richiesta: r } = await inoltrata(new Request('https://shopbeautylab.it/bollino'));
  assert.equal(new URL(r.url).hostname, 'shopbeautylab.it');
  assert.equal(r.headers.get('X-Sissibol-Origine'), null);
});
