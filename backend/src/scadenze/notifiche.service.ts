import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../prisma/prisma.service';
import { ScadenzeService } from './scadenze.service';
import { MailerService } from '../mail/mailer.service';
import { formattaOrario, fusoOrarioApplicazione, leggiOrario } from '../mail/fuso-orario';
import { escapeHtml } from '../avvisi/composizione';
import { destinatariStudio } from '../mail/destinatari';

const NOTIFICHE_CRON_JOB = 'notifiche-riepilogo-giornaliero';

/**
 * Notifiche email per le scadenze imminenti.
 *
 * Disattivato di default: si attiva solo se il server di posta è configurato
 * (vedi MailerService). Ogni giorno all'ora configurata (NOTIFICHE_ORA,
 * default 07:00, nel fuso di APP_FUSO_ORARIO) invia un
 * riepilogo delle scadenze in scadenza nei prossimi N giorni
 * (NOTIFICHE_GIORNI_ANTICIPO, default 30) ai destinatari di
 * NOTIFICHE_EMAIL_TO (lista separata da virgole) o, in mancanza,
 * a tutti gli utenti ADMIN.
 */
@Injectable()
export class NotificheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificheService.name);

  constructor(
    private prisma: PrismaService,
    private scadenzeService: ScadenzeService,
    private schedulerRegistry: SchedulerRegistry,
    private mailer: MailerService,
  ) {}

  onModuleInit() {
    if (!this.mailer.configurato) {
      this.logger.log('Riepilogo email disabilitato (server di posta non configurato)');
      return;
    }

    // Pianifica l'invio giornaliero all'ora configurata (NOTIFICHE_ORA)
    const orario = leggiOrario(process.env.NOTIFICHE_ORA, '07:00');
    const fuso = fusoOrarioApplicazione();

    const job = new CronJob(`${orario.minuti} ${orario.ora} * * *`, () => {
      void this.inviaRiepilogo();
    }, null, false, fuso);
    this.schedulerRegistry.addCronJob(NOTIFICHE_CRON_JOB, job);
    job.start();

    this.logger.log(
      `Riepilogo email attivo: invio giornaliero alle ${formattaOrario(orario)} (${fuso})`,
    );
  }

  onModuleDestroy() {
    if (this.schedulerRegistry.doesExist('cron', NOTIFICHE_CRON_JOB)) {
      this.schedulerRegistry.deleteCronJob(NOTIFICHE_CRON_JOB);
    }
  }

  private getDestinatari(): Promise<string[]> {
    return destinatariStudio(this.prisma);
  }

  /**
   * Invia il riepilogo delle scadenze imminenti. Pubblico per poterlo
   * invocare manualmente (endpoint di test) oltre che dallo scheduler.
   */
  async inviaRiepilogo(): Promise<{ inviata: boolean; scadenze: number; destinatari: number }> {
    if (!this.mailer.configurato) {
      return { inviata: false, scadenze: 0, destinatari: 0 };
    }

    try {
      const giorni = parseInt(process.env.NOTIFICHE_GIORNI_ANTICIPO || '30', 10);
      const scadenze = await this.scadenzeService.getScadenzeInScadenza(
        Number.isFinite(giorni) ? giorni : 30,
      );

      if (scadenze.length === 0) {
        this.logger.log('Nessuna scadenza imminente: email non inviata');
        return { inviata: false, scadenze: 0, destinatari: 0 };
      }

      const destinatari = await this.getDestinatari();
      if (destinatari.length === 0) {
        this.logger.warn('Nessun destinatario per le notifiche email');
        return { inviata: false, scadenze: scadenze.length, destinatari: 0 };
      }

      const righe = scadenze
        .map((s: any) => {
          const cliente = s.veicolo?.cliente;
          const nomeCliente = cliente?.ragioneSociale
            || [cliente?.cognome, cliente?.nome].filter(Boolean).join(' ')
            || 'N/A';
          const importo = s.importoPrevisto ? `€ ${Number(s.importoPrevisto).toFixed(2)}` : '-';
          // Nomi e targhe vengono dall'archivio: vanno trattati come testo.
          return `<tr>
            <td style="padding:4px 8px;border:1px solid #ddd">${escapeHtml(s.veicolo?.targa || '-')}</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${escapeHtml(nomeCliente)}</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${s.meseScadenza}/${s.annoScadenza}</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${importo}</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${s.giorniRimanenti} giorni (${s.urgenza})</td>
          </tr>`;
        })
        .join('');

      const html = `
        <h2>Sissibol - Scadenze bolli imminenti</h2>
        <p>Ci sono <strong>${scadenze.length}</strong> scadenze nei prossimi giorni:</p>
        <table style="border-collapse:collapse">
          <tr>
            <th style="padding:4px 8px;border:1px solid #ddd">Targa</th>
            <th style="padding:4px 8px;border:1px solid #ddd">Cliente</th>
            <th style="padding:4px 8px;border:1px solid #ddd">Scadenza</th>
            <th style="padding:4px 8px;border:1px solid #ddd">Importo</th>
            <th style="padding:4px 8px;border:1px solid #ddd">Urgenza</th>
          </tr>
          ${righe}
        </table>`;

      await this.mailer.spedisci({
        a: destinatari,
        oggetto: `Sissibol: ${scadenze.length} scadenze bolli imminenti`,
        testo: `Ci sono ${scadenze.length} scadenze nei prossimi giorni. Il dettaglio è nella versione HTML di questo messaggio.`,
        html,
      });

      this.logger.log(
        `Email riepilogo inviata: ${scadenze.length} scadenze a ${destinatari.length} destinatari`,
      );
      return { inviata: true, scadenze: scadenze.length, destinatari: destinatari.length };
    } catch (error) {
      this.logger.error(`Errore invio notifiche email: ${error.message}`);
      return { inviata: false, scadenze: 0, destinatari: 0 };
    }
  }
}
