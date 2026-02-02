import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // BUG FIX: Rate limiting globale per prevenire brute force e DoS
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 secondo
        limit: 10, // max 10 richieste per secondo
      },
      {
        name: 'medium',
        ttl: 60000, // 1 minuto
        limit: 100, // max 100 richieste per minuto
      },
      {
        name: 'long',
        ttl: 3600000, // 1 ora
        limit: 1000, // max 1000 richieste per ora
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
