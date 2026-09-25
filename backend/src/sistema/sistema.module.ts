import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SistemaController } from './sistema.controller';
import { SistemaService } from './sistema.service';

@Module({
  imports: [PrismaModule],
  controllers: [SistemaController],
  providers: [SistemaService],
})
export class SistemaModule {}
