import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { leggiOriginiConsentite, origineAmmessa, RichiestaCors } from './common/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Necessario per leggere il refresh token dal cookie httpOnly
  app.use(cookieParser());

  // BUG FIX: Security headers per prevenire XSS, clickjacking, etc.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        scriptSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Necessario per alcune risorse esterne
  }));

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

  // Enable validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // Su SIGTERM (docker stop, aggiornamenti) chiude in ordine: job pianificati
  // fermati e connessioni al database rilasciate, invece di un'interruzione brusca.
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
}

bootstrap();
