import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { leggiOriginiConsentite, origineAmmessa, RichiestaCors } from './common/cors';

/** Lunghezza minima del segreto che firma i token. */
export const LUNGHEZZA_MINIMA_JWT_SECRET = 32;

/**
 * In produzione un segreto corto o d'esempio permetterebbe di forgiare token
 * validi: meglio non partire che partire vulnerabili.
 */
export function verificaSegreti(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  const segreto = env.JWT_SECRET ?? '';
  const esempi = ['your-production-secret-key-change-me', 'cambia-questo-secret-in-produzione', 'CHANGE_ME_TO_A_STRONG_SECRET_KEY'];
  if (segreto.length < LUNGHEZZA_MINIMA_JWT_SECRET || esempi.includes(segreto)) {
    throw new Error(
      `JWT_SECRET assente, d'esempio o più corta di ${LUNGHEZZA_MINIMA_JWT_SECRET} caratteri: ` +
        'generarla con "openssl rand -base64 48" e impostarla nel file .env',
    );
  }
}

/**
 * Configurazione HTTP dell'applicazione, condivisa dall'avvio (main.ts) e dai
 * test di integrazione HTTP: i test verificano la configurazione vera.
 */
export function configuraApp(app: NestExpressApplication): void {
  // Dietro il proxy (nginx) l'IP del client è nell'intestazione X-Forwarded-For
  // impostata da nginx. Senza, ogni richiesta sembrava arrivare da nginx: il
  // limite dei tentativi di login era unico per tutti, e un attaccante poteva
  // bloccare l'accesso all'intero studio. Si fida di un solo passaggio (nginx),
  // quindi un X-Forwarded-For inventato dal client non ha effetto.
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  // L'intestazione X-Powered-By rivela il framework: nessun motivo di esporla.
  app.disable('x-powered-by');

  // Necessario per leggere il refresh token dal cookie httpOnly
  app.use(cookieParser());

  // Intestazioni di sicurezza (XSS, clickjacking, sniffing del tipo MIME).
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // CORS: ammesse le origini di CORS_ORIGINS e sempre la stessa origine a cui
  // è indirizzata la richiesta (frontend servito da nginx). Vedi common/cors.ts.
  // Le altre origini sono rifiutate: non si torna a `origin: true`, che
  // permetteva qualsiasi origine (vulnerabilità CSRF).
  const allowedOrigins = leggiOriginiConsentite(process.env.CORS_ORIGINS);

  app.enableCors((req: RichiestaCors, callback) => {
    const origin = req.headers.origin as string | undefined;
    const opzioni = {
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    };
    if (origineAmmessa(origin, req, allowedOrigins)) {
      return callback(null, { ...opzioni, origin: true });
    }
    return callback(new Error(`Origin ${origin} non consentito da CORS`), { origin: false });
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Su SIGTERM (docker stop, aggiornamenti) chiude in ordine: job pianificati
  // fermati e connessioni al database rilasciate, invece di un'interruzione brusca.
  app.enableShutdownHooks();
}
