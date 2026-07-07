import { Module } from '@nestjs/common';
import { ScadenzeService } from './scadenze.service';
import { NotificheService } from './notifiche.service';
import { ScadenzeController } from './scadenze.controller';
import { BolloModule } from '../bollo/bollo.module';

@Module({
  imports: [BolloModule],
  controllers: [ScadenzeController],
  providers: [ScadenzeService, NotificheService],
  exports: [ScadenzeService],
})
export class ScadenzeModule {}
