import { Module } from '@nestjs/common';
import { VeicoliService } from './veicoli.service';
import { VeicoliController } from './veicoli.controller';
import { BolloModule } from '../bollo/bollo.module';

@Module({
  imports: [BolloModule],
  controllers: [VeicoliController],
  providers: [VeicoliService],
  exports: [VeicoliService],
})
export class VeicoliModule {}
