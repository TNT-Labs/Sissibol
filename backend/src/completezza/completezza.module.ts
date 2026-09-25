import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BolloModule } from '../bollo/bollo.module';
import { VeicoliModule } from '../veicoli/veicoli.module';
import { CompletezzaService } from './completezza.service';
import { CompletezzaController } from './completezza.controller';

@Module({
  imports: [PrismaModule, BolloModule, VeicoliModule],
  controllers: [CompletezzaController],
  providers: [CompletezzaService],
  exports: [CompletezzaService],
})
export class CompletezzaModule {}
