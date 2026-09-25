/**
 * Test di sicurezza via HTTP sull'applicazione completa.
 *
 * Avvia AppModule con la stessa configurazione di produzione (configuraApp)
 * dietro un proxy simulato (TRUST_PROXY, X-Forwarded-For come lo imposta
 * nginx) e verifica ciò che un attaccante vedrebbe: cookie, risposte agli
 * errori, blocco dei tentativi, uso improprio dei token.
 */

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { disconnectPrisma, getPrisma, getTestDatabaseUrl, resetDatabase } from './setup/test-db';

const PASSWORD_ADMIN = 'Iniziale-Provvisoria-2026!';
const PASSWORD_NUOVA = 'Tassa#Automobilistica-42';

describe('Sicurezza degli accessi (HTTP)', () => {
  let app: INestApplication;
  let base: string;
  const prisma = getPrisma();
  let ipProgressivo = 1;
  /** Ogni test usa IP diversi, come client diversi dietro nginx. */
  const nuovoIp = () => `203.0.113.${ipProgressivo++}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = getTestDatabaseUrl();
    process.env.JWT_SECRET = 'segreto-dei-test-di-integrazione-abbastanza-lungo';
    process.env.TRUST_PROXY = 'true';
    process.env.COOKIE_PATH = '/bolli/api/auth';
    process.env.COOKIE_SECURE = 'true';

    // Importati dopo l'impostazione dell'ambiente, che leggono all'avvio.
    const { AppModule } = await import('../../src/app.module');
    const { configuraApp } = await import('../../src/configura-app');
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
    configuraApp(app as NestExpressApplication);
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  });

  beforeEach(async () => {
    await resetDatabase();
    await prisma.utente.create({
      data: {
        email: 'admin@studio.it',
        password: await bcrypt.hash(PASSWORD_ADMIN, 10),
        ruolo: 'ADMIN',
        deveCambiarePassword: true,
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await disconnectPrisma();
  });

  async function richiesta(
    metodo: string,
    percorso: string,
    opzioni: { corpo?: unknown; token?: string; ip?: string; cookie?: string } = {},
  ) {
    const risposta = await fetch(base + percorso, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': opzioni.ip ?? nuovoIp(),
        ...(opzioni.token ? { Authorization: `Bearer ${opzioni.token}` } : {}),
        ...(opzioni.cookie ? { Cookie: opzioni.cookie } : {}),
      },
      body: opzioni.corpo === undefined ? undefined : JSON.stringify(opzioni.corpo),
    });
    const testo = await risposta.text();
    let json: any = null;
    try {
      json = JSON.parse(testo);
    } catch {
      json = testo;
    }
    return { stato: risposta.status, json, intestazioni: risposta.headers };
  }

  const accedi = (password = PASSWORD_ADMIN, ip?: string) =>
    richiesta('POST', '/auth/login', { corpo: { email: 'admin@studio.it', password }, ip });

  /** Valore del cookie di refresh dalla risposta. */
  const cookieRefresh = (intestazioni: Headers) => {
    const riga = intestazioni.getSetCookie().find((c) => c.startsWith('refresh_token='));
    return { riga, valore: riga?.split(';')[0] };
  };

  describe('login', () => {
    it('il refresh token sta solo in un cookie httpOnly, Secure, SameSite=Strict, sul solo percorso di autenticazione', async () => {
      const r = await accedi();

      expect(r.stato).toBe(201);
      expect(r.json.access_token).toEqual(expect.any(String));
      expect(r.json.refresh_token).toBeUndefined();
      const { riga } = cookieRefresh(r.intestazioni);
      expect(riga).toMatch(/HttpOnly/i);
      expect(riga).toMatch(/Secure/i);
      expect(riga).toMatch(/SameSite=Strict/i);
      expect(riga).toMatch(/Path=\/bolli\/api\/auth/);
    });

    it('email inesistente e password errata danno la stessa risposta', async () => {
      const inesistente = await richiesta('POST', '/auth/login', {
        corpo: { email: 'nessuno@studio.it', password: PASSWORD_ADMIN },
      });
      const errata = await accedi('Password-Sbagliata-99!');

      expect(inesistente.stato).toBe(401);
      expect(errata.stato).toBe(401);
      expect(inesistente.json.message).toBe(errata.json.message);
    });

    it(`dopo 5 password errate l'accesso è sospeso, anche con la password giusta`, async () => {
      for (let i = 0; i < 5; i++) {
        expect((await accedi('Password-Sbagliata-99!')).stato).toBe(401);
      }

      const conPasswordGiusta = await accedi();

      expect(conPasswordGiusta.stato).toBe(401);
      const utente = await prisma.utente.findUnique({ where: { email: 'admin@studio.it' } });
      expect(utente.bloccatoFinoA.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
      expect(await prisma.auditLog.count({ where: { entita: 'utente' } })).toBe(1);
    });

    it('un accesso riuscito azzera gli errori precedenti', async () => {
      for (let i = 0; i < 4; i++) await accedi('Password-Sbagliata-99!');

      expect((await accedi()).stato).toBe(201);
      expect((await prisma.utente.findUnique({ where: { email: 'admin@studio.it' } })).tentativiFalliti).toBe(0);
    });

    it('il limite di tentativi per minuto vale per singolo client, non per tutti', async () => {
      const attaccante = nuovoIp();
      const risposte = [];
      for (let i = 0; i < 6; i++) risposte.push((await accedi('Password-Sbagliata-99!', attaccante)).stato);

      // Il sesto tentativo dallo stesso client è respinto dal limite...
      expect(risposte[5]).toBe(429);
      // ...ma un altro utente dello studio accede senza problemi (prima,
      // dietro nginx, tutti condividevano lo stesso limite).
      await prisma.utente.update({ where: { email: 'admin@studio.it' }, data: { bloccatoFinoA: null, tentativiFalliti: 0 } });
      expect((await accedi(PASSWORD_ADMIN, nuovoIp())).stato).toBe(201);
    });
  });

  describe('cambio password obbligatorio', () => {
    it('finché la password non è cambiata, si può solo cambiarla', async () => {
      const { json } = await accedi();
      expect(json.user.deveCambiarePassword).toBe(true);

      const clienti = await richiesta('GET', '/clienti', { token: json.access_token });
      expect(clienti.stato).toBe(403);
      expect(clienti.json.codice).toBe('PASSWORD_DA_CAMBIARE');

      const profilo = await richiesta('GET', '/auth/profile', { token: json.access_token });
      expect(profilo.stato).toBe(200);
      expect(profilo.json.deveCambiarePassword).toBe(true);
    });

    it('rifiuta una nuova password debole, uguale alla vecchia o con la password attuale sbagliata', async () => {
      const { json } = await accedi();
      const cambia = (currentPassword: string, newPassword: string) =>
        richiesta('POST', '/auth/change-password', { token: json.access_token, corpo: { currentPassword, newPassword } });

      const debole = await cambia(PASSWORD_ADMIN, 'corta1!');
      expect(debole.stato).toBe(400);
      expect(JSON.stringify(debole.json.message)).toMatch(/Almeno 12 caratteri/);

      expect((await cambia(PASSWORD_ADMIN, 'Admin-Studio-2026!!')).stato).toBe(400); // contiene "admin"
      expect((await cambia(PASSWORD_ADMIN, PASSWORD_ADMIN)).stato).toBe(400);
      expect((await cambia('Non-Questa-Password-1!', PASSWORD_NUOVA)).stato).toBe(401);
    });

    it('dopo il cambio l\'applicazione è utilizzabile', async () => {
      const { json } = await accedi();
      const cambio = await richiesta('POST', '/auth/change-password', {
        token: json.access_token,
        corpo: { currentPassword: PASSWORD_ADMIN, newPassword: PASSWORD_NUOVA },
      });
      expect(cambio.stato).toBe(201);

      expect((await richiesta('GET', '/clienti', { token: json.access_token })).stato).toBe(200);
      const utente = await prisma.utente.findUnique({ where: { email: 'admin@studio.it' } });
      expect(utente.deveCambiarePassword).toBe(false);
      expect(utente.passwordCambiataIl).not.toBeNull();
      // La vecchia password non vale più.
      expect((await accedi(PASSWORD_ADMIN)).stato).toBe(401);
    });
  });

  describe('token', () => {
    async function accessoCompleto() {
      await prisma.utente.update({ where: { email: 'admin@studio.it' }, data: { deveCambiarePassword: false } });
      return accedi();
    }

    it('il refresh token rinnova la sessione ma non vale come token di accesso', async () => {
      const login = await accessoCompleto();
      const { valore } = cookieRefresh(login.intestazioni);
      const refreshToken = valore.split('=')[1];

      const comeAccesso = await richiesta('GET', '/clienti', { token: refreshToken });
      expect(comeAccesso.stato).toBe(401);

      const rinnovo = await richiesta('POST', '/auth/refresh', { cookie: valore });
      expect(rinnovo.stato).toBe(201);
      expect(rinnovo.json.access_token).toEqual(expect.any(String));
      expect(rinnovo.json.refresh_token).toBeUndefined();

      // Rotazione: il refresh token già usato non vale più.
      expect((await richiesta('POST', '/auth/refresh', { cookie: valore })).stato).toBe(401);
    });

    it('il logout toglie il cookie, anche quello delle versioni precedenti (percorso /)', async () => {
      const login = await accessoCompleto();
      const { valore } = cookieRefresh(login.intestazioni);

      const r = await richiesta('POST', '/auth/logout', { token: login.json.access_token, cookie: valore });

      expect(r.stato).toBe(201);
      const tolti = r.intestazioni.getSetCookie().filter((c) => c.startsWith('refresh_token=;'));
      expect(tolti.map((c) => c.match(/Path=([^;]+)/)[1]).sort()).toEqual(['/', '/bolli/api/auth']);
      expect((await richiesta('POST', '/auth/refresh', { cookie: valore })).stato).toBe(401);
    });

    it('un token di accesso non vale come refresh token', async () => {
      const login = await accessoCompleto();
      const r = await richiesta('POST', '/auth/refresh', { cookie: `refresh_token=${login.json.access_token}` });
      expect(r.stato).toBe(401);
    });

    it('un utente eliminato perde subito l\'accesso, prima che il token scada', async () => {
      const login = await accessoCompleto();
      await prisma.refreshToken.deleteMany();
      await prisma.utente.delete({ where: { email: 'admin@studio.it' } });

      expect((await richiesta('GET', '/clienti', { token: login.json.access_token })).stato).toBe(401);
    });

    it('il ruolo è quello attuale, non quello del momento del login', async () => {
      const login = await accessoCompleto();
      await prisma.utente.update({ where: { email: 'admin@studio.it' }, data: { ruolo: 'OPERATORE' } });

      expect((await richiesta('GET', '/utenti', { token: login.json.access_token })).stato).toBe(403);
    });
  });

  describe('gestione utenti', () => {
    it('un utente creato dall\'amministratore ha una password robusta e deve cambiarla', async () => {
      await prisma.utente.update({ where: { email: 'admin@studio.it' }, data: { deveCambiarePassword: false } });
      const { json } = await accedi();
      const crea = (password: string) =>
        richiesta('POST', '/utenti', {
          token: json.access_token,
          corpo: { email: 'mario.rossi@studio.it', password, ruolo: 'OPERATORE' },
        });

      expect((await crea('password123')).stato).toBe(400);
      expect((await crea('Mario.Rossi-Studio-7!')).stato).toBe(400); // contiene il nome dell'email
      const creato = await crea('Provvisoria#Studio-2026');
      expect(creato.stato).toBe(201);
      expect(creato.json.deveCambiarePassword).toBe(true);
    });

    it('la propria password non si reimposta dalla gestione utenti, e l\'ultimo amministratore resta tale', async () => {
      await prisma.utente.update({ where: { email: 'admin@studio.it' }, data: { deveCambiarePassword: false } });
      const { json } = await accedi();
      const io = json.user.id;

      const password = await richiesta('PATCH', `/utenti/${io}`, {
        token: json.access_token,
        corpo: { password: 'Provvisoria#Studio-2026' },
      });
      expect(password.stato).toBe(400);

      const ruolo = await richiesta('PATCH', `/utenti/${io}`, { token: json.access_token, corpo: { ruolo: 'OPERATORE' } });
      expect(ruolo.stato).toBe(400);
      expect((await prisma.utente.findUnique({ where: { id: io } })).ruolo).toBe('ADMIN');
    });

    it('la password reimpostata dall\'amministratore sblocca l\'utente, che deve cambiarla', async () => {
      await prisma.utente.update({ where: { email: 'admin@studio.it' }, data: { deveCambiarePassword: false } });
      const operatore = await prisma.utente.create({
        data: {
          email: 'operatore@studio.it',
          password: await bcrypt.hash('Vecchia#Password-2025', 10),
          ruolo: 'OPERATORE',
          tentativiFalliti: 5,
          bloccatoFinoA: new Date(Date.now() + 10 * 60_000),
        },
      });
      const { json } = await accedi();

      const r = await richiesta('PATCH', `/utenti/${operatore.id}`, {
        token: json.access_token,
        corpo: { password: 'Provvisoria#Studio-2026' },
      });

      expect(r.stato).toBe(200);
      expect(r.json.deveCambiarePassword).toBe(true);
      expect(r.json.bloccatoFinoA).toBeNull();
      const login = await richiesta('POST', '/auth/login', {
        corpo: { email: 'operatore@studio.it', password: 'Provvisoria#Studio-2026' },
      });
      expect(login.stato).toBe(201);
      expect(login.json.user.deveCambiarePassword).toBe(true);
    });
  });

  describe('intestazioni', () => {
    it('/health è pubblico e l\'applicazione non rivela il framework', async () => {
      const r = await richiesta('GET', '/health');
      expect(r.stato).toBe(200);
      expect(r.intestazioni.get('x-powered-by')).toBeNull();
      expect(r.intestazioni.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(r.intestazioni.get('content-security-policy')).toContain("frame-ancestors 'none'");
    });
  });
});
