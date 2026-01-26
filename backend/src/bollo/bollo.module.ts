import { Module } from '@nestjs/common';
import { BolloService } from './bollo.service';
import { BolloController } from './bollo.controller';
import { TariffeService } from './tariffe.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BolloController],
  providers: [BolloService, TariffeService],
  exports: [BolloService, TariffeService],
})
export class BolloModule {}
