import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClientiModule } from './clienti/clienti.module';
import { VeicoliModule } from './veicoli/veicoli.module';
import { ScadenzeModule } from './scadenze/scadenze.module';
import { PagamentiModule } from './pagamenti/pagamenti.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    ClientiModule,
    VeicoliModule,
    ScadenzeModule,
    PagamentiModule,
  ],
})
export class AppModule {}
