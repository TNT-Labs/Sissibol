import { Module } from '@nestjs/common';
import { VeicoliService } from './veicoli.service';
import { VeicoliController } from './veicoli.controller';

@Module({
  controllers: [VeicoliController],
  providers: [VeicoliService],
})
export class VeicoliModule {}
