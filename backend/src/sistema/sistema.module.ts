import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SistemaController } from './sistema.controller';
import { SistemaService } from './sistema.service';
import { AllarmeBackupService } from './allarme-backup.service';

@Module({
  imports: [PrismaModule],
  controllers: [SistemaController],
  providers: [SistemaService, AllarmeBackupService],
})
export class SistemaModule {}
