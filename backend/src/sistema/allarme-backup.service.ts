import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { destinatariStudio } from '../mail/destinatari';
import { fusoOrarioApplicazione } from '../mail/fuso-orario';
import { SistemaService } from './sistema.service';
import { componiAvviso, decidiAvviso, type ProblemaComunicato, type TipoAvviso } from './allarme-backup';

/**
 * Nei primi minuti dopo l'avvio non si controlla: alla prima installazione
 * il servizio di backup aspetta le tabelle e poi fa il primo backup, e nel
 * frattempo lo stato risulterebbe (falsamente) in errore.
 */
export const MINUTI_DI_TOLLERANZA_ALL_AVVIO = 20;

/**
 * Sorveglia i backup ogni 30 minuti e avvisa lo studio per email quando non
 * funzionano (vedi allarme-backup.ts per le regole). Attivo solo con il
 * server di posta e lo stato dei backup configurati.
 *
 * Ciò che è stato già comunicato resta in memoria: dopo un riavvio del
 * backend, un problema ancora in corso viene riavvisato una volta.
 */
@Injectable()
export class AllarmeBackupService {
  private readonly logger = new Logger(AllarmeBackupService.name);
  private readonly avvio = new Date();
  private comunicato: ProblemaComunicato | null = null;

  constructor(
    private readonly sistema: SistemaService,
    private readonly mailer: MailerService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'allarme-backup' })
  async controllaPianificato() {
    await this.controlla();
  }

  /** Esegue un controllo; restituisce l'avviso spedito, se c'è stato. */
  async controlla(adesso = new Date()): Promise<TipoAvviso | null> {
    if (!this.mailer.configurato || !process.env.BACKUP_STATO_FILE) return null;
    if (adesso.getTime() - this.avvio.getTime() < MINUTI_DI_TOLLERANZA_ALL_AVVIO * 60_000) return null;

    const stato = await this.sistema.statoBackup(adesso);
    const decisione = decidiAvviso(stato, this.comunicato, adesso);
    if (!decisione.avviso) {
      this.comunicato = decisione.dopo;
      return null;
    }

    const destinatari = await destinatariStudio(this.prisma);
    if (destinatari.length === 0) {
      this.logger.error(`Backup: ${stato.messaggio} Nessun destinatario per l'avviso (NOTIFICHE_EMAIL_TO o amministratori).`);
      return null;
    }

    const messaggio = componiAvviso(decisione.avviso, stato, fusoOrarioApplicazione());
    try {
      await this.mailer.spedisci({ a: destinatari, oggetto: messaggio.oggetto, testo: messaggio.testo });
    } catch (errore) {
      // Non si registra come comunicato: al prossimo controllo si riprova.
      this.logger.error(`Avviso sui backup non spedito: ${(errore as Error).message}`);
      return null;
    }
    this.comunicato = decisione.dopo;
    this.logger.warn(`Avviso sui backup spedito (${decisione.avviso}) a ${destinatari.length} destinatari: ${stato.messaggio}`);
    return decisione.avviso;
  }
}
