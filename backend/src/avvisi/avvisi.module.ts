import { Module } from '@nestjs/common';
import { AvvisiService } from './avvisi.service';
import { AvvisiController } from './avvisi.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ScadenzeModule } from '../scadenze/scadenze.module';

@Module({
  imports: [PrismaModule, ScadenzeModule],
  controllers: [AvvisiController],
  providers: [AvvisiService],
  exports: [AvvisiService],
})
export class AvvisiModule {}
