import { Module } from '@nestjs/common';
import { ScadenzeService } from './scadenze.service';
import { ScadenzeController } from './scadenze.controller';
import { BolloModule } from '../bollo/bollo.module';

@Module({
  imports: [BolloModule],
  controllers: [ScadenzeController],
  providers: [ScadenzeService],
  exports: [ScadenzeService],
})
export class ScadenzeModule {}
