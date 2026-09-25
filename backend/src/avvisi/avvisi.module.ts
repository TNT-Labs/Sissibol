import { Module } from '@nestjs/common';
import { AvvisiService } from './avvisi.service';
import { AvvisiController } from './avvisi.controller';
import { AvvisiInvioService, CONFIGURAZIONE_AVVISI, MITTENTE } from './avvisi-invio.service';
import { AvvisiPianificazioneService } from './avvisi-pianificazione.service';
import { leggiConfigurazioneAvvisi } from './configurazione';
import { PrismaModule } from '../prisma/prisma.module';
import { ScadenzeModule } from '../scadenze/scadenze.module';
import { MailerService } from '../mail/mailer.service';

@Module({
  imports: [PrismaModule, ScadenzeModule],
  controllers: [AvvisiController],
  providers: [
    AvvisiService,
    AvvisiInvioService,
    AvvisiPianificazioneService,
    { provide: MITTENTE, useExisting: MailerService },
    { provide: CONFIGURAZIONE_AVVISI, useFactory: () => leggiConfigurazioneAvvisi() },
  ],
  exports: [AvvisiService, AvvisiInvioService],
})
export class AvvisiModule {}
