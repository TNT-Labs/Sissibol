import { leggiOriginiConsentite, origineAmmessa, stessaOrigine } from './cors';

const richiesta = (headers: Record<string, string>) => ({ headers });

describe('CORS', () => {
  const consentite = leggiOriginiConsentite(undefined);

  it('ammette le richieste senza Origin (client non browser)', () => {
    expect(origineAmmessa(undefined, richiesta({ host: 'backend:3000' }), consentite)).toBe(true);
  });

  it('ammette le origini configurate', () => {
    expect(origineAmmessa('http://localhost:5173', richiesta({ host: 'localhost:3000' }), consentite)).toBe(true);
    expect(
      origineAmmessa('https://a.it', richiesta({ host: 'x' }), leggiOriginiConsentite(' https://a.it , https://b.it ')),
    ).toBe(true);
  });

  it('ammette la stessa origine dietro nginx, che inoltra Host senza porta', () => {
    // docker-compose.yml: interfaccia su http://localhost, API su /api
    expect(origineAmmessa('http://localhost', richiesta({ host: 'localhost' }), consentite)).toBe(true);
    // Accesso da un altro PC della rete
    expect(origineAmmessa('http://192.168.1.20', richiesta({ host: '192.168.1.20' }), consentite)).toBe(true);
    // HTTPS: nginx imposta anche X-Forwarded-Host
    expect(
      origineAmmessa(
        'https://studio.duckdns.org',
        richiesta({ host: 'studio.duckdns.org', 'x-forwarded-host': 'studio.duckdns.org' }),
        consentite,
      ),
    ).toBe(true);
  });

  it('rifiuta un\'origine diversa, anche con cookie di sessione validi', () => {
    expect(origineAmmessa('https://sito-malevolo.it', richiesta({ host: 'studio.duckdns.org' }), consentite)).toBe(false);
    expect(
      origineAmmessa('https://studio.duckdns.org.evil.it', richiesta({ host: 'studio.duckdns.org' }), consentite),
    ).toBe(false);
  });

  it('con la porta nell\'host, la porta deve coincidere', () => {
    expect(stessaOrigine('http://localhost:3000', richiesta({ host: 'localhost:3000' }))).toBe(true);
    expect(stessaOrigine('http://localhost:8080', richiesta({ host: 'localhost:3000' }))).toBe(false);
    expect(stessaOrigine('http://[::1]:3000', richiesta({ host: '[::1]:3000' }))).toBe(true);
    expect(stessaOrigine('http://[::1]', richiesta({ host: '[::1]' }))).toBe(true);
  });

  it('usa il primo host della catena X-Forwarded-Host', () => {
    expect(
      stessaOrigine('https://a.it', richiesta({ host: 'backend:3000', 'x-forwarded-host': 'a.it, proxy.interno' })),
    ).toBe(true);
  });

  it('non ammette origini malformate o richieste senza host', () => {
    expect(stessaOrigine('non-un-url', richiesta({ host: 'x' }))).toBe(false);
    expect(stessaOrigine('null', richiesta({ host: 'x' }))).toBe(false);
    expect(stessaOrigine('http://x', richiesta({}))).toBe(false);
  });

  it('ignora le maiuscole nel nome host', () => {
    expect(stessaOrigine('https://Studio.DuckDNS.org', richiesta({ host: 'studio.duckdns.org' }))).toBe(true);
  });
});
