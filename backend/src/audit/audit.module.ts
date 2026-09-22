import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Il registro delle modifiche serve trasversalmente a più moduli, quindi è
 * globale: evita di doverlo importare in ogni modulo che deve tracciare.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
