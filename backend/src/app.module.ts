import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClientiModule } from './clienti/clienti.module';
import { VeicoliModule } from './veicoli/veicoli.module';
import { ScadenzeModule } from './scadenze/scadenze.module';
import { PagamentiModule } from './pagamenti/pagamenti.module';
import { BolloModule } from './bollo/bollo.module';
import { UtentiModule } from './utenti/utenti.module';
import { AvvisiModule } from './avvisi/avvisi.module';
import { AuditModule } from './audit/audit.module';
import { MailModule } from './mail/mail.module';
import { CompletezzaModule } from './completezza/completezza.module';
import { SistemaModule } from './sistema/sistema.module';
import { ReportModule } from './report/report.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Scheduler per i job ricorrenti (aggiornamento scadenze, notifiche email)
    ScheduleModule.forRoot(),
    // BUG FIX: Rate limiting globale per prevenire brute force e DoS
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 secondo
        limit: 10, // max 10 richieste per secondo
      },
      // Limiti per IP. Dietro Cloudflare tutto lo studio può uscire da un
      // unico indirizzo pubblico, e la ricerca durante la digitazione moltiplica
      // le richieste: con 100 al minuto e 1000 all'ora il lavoro normale di più
      // persone riceveva errori 429. Il login ha limiti propri, molto più
      // stretti, e il blocco dell'utente dopo 5 password errate.
      {
        name: 'medium',
        ttl: 60000, // 1 minuto
        limit: 300,
      },
      {
        name: 'long',
        ttl: 3600000, // 1 ora
        limit: 6000,
      },
    ]),
    PrismaModule,
    AuthModule,
    ClientiModule,
    VeicoliModule,
    ScadenzeModule,
    PagamentiModule,
    BolloModule,
    UtentiModule,
    AvvisiModule,
    AuditModule,
    MailModule,
    CompletezzaModule,
    SistemaModule,
    ReportModule,
  ],
  providers: [
    // Applica rate limiting globalmente
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
