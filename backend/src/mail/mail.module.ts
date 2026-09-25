import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

/** Server di posta condiviso: globale come il registro delle modifiche. */
@Global()
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailModule {}
