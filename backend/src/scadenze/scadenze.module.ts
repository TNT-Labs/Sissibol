import { Module } from '@nestjs/common';
import { ScadenzeService } from './scadenze.service';
import { ScadenzeController } from './scadenze.controller';

@Module({
  controllers: [ScadenzeController],
  providers: [ScadenzeService],
  exports: [ScadenzeService],
})
export class ScadenzeModule {}
