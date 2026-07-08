import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { ScadenzeService } from './scadenze.service';

const NOTIFICHE_CRON_JOB = 'notifiche-riepilogo-giornaliero';

/**
 * Notifiche email per le scadenze imminenti.
 *
 * Disattivato di default: si attiva solo se SMTP_HOST è configurato.
 * Ogni giorno all'ora configurata (NOTIFICHE_ORA, default 07:00) invia un
 * riepilogo delle scadenze in scadenza nei prossimi N giorni
 * (NOTIFICHE_GIORNI_ANTICIPO, default 30) ai destinatari di
 * NOTIFICHE_EMAIL_TO (lista separata da virgole) o, in mancanza,
 * a tutti gli utenti ADMIN.
 */
@Injectable()
export class NotificheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificheService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private prisma: PrismaService,
    private scadenzeService: ScadenzeService,
    private schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit() {
    const host = process.env.SMTP_HOST;
    if (!host) {
      this.logger.log('Notifiche email disabilitate (SMTP_HOST non configurato)');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });

    // Pianifica l'invio giornaliero all'ora configurata (NOTIFICHE_ORA)
    const { ora, minuti } = this.parseOra(process.env.NOTIFICHE_ORA);
    const cronExpression = `${minuti} ${ora} * * *`;

    const job = new CronJob(cronExpression, () => {
      void this.inviaRiepilogo();
    });
    this.schedulerRegistry.addCronJob(NOTIFICHE_CRON_JOB, job);
    job.start();

    this.logger.log(
      `Notifiche email attive: invio giornaliero pianificato alle ${String(ora).padStart(2, '0')}:${String(minuti).padStart(2, '0')}`,
    );
  }

  onModuleDestroy() {
    if (this.schedulerRegistry.doesExist('cron', NOTIFICHE_CRON_JOB)) {
      this.schedulerRegistry.deleteCronJob(NOTIFICHE_CRON_JOB);
    }
  }

  /** Interpreta la variabile NOTIFICHE_ORA (formato HH:MM), con fallback 07:00. */
  private parseOra(valore?: string): { ora: number; minuti: number } {
    const [oraRaw, minutiRaw] = (valore || '07:00').split(':').map((v) => parseInt(v, 10));
    const ora = Number.isFinite(oraRaw) && oraRaw >= 0 && oraRaw <= 23 ? oraRaw : 7;
    const minuti = Number.isFinite(minutiRaw) && minutiRaw >= 0 && minutiRaw <= 59 ? minutiRaw : 0;
    return { ora, minuti };
  }

  private async getDestinatari(): Promise<string[]> {
    const configurati = process.env.NOTIFICHE_EMAIL_TO;
    if (configurati) {
      return configurati.split(',').map((e) => e.trim()).filter(Boolean);
    }

    // Fallback: tutti gli utenti ADMIN
    const admins = await this.prisma.utente.findMany({
      where: { ruolo: 'ADMIN' },
      select: { email: true },
    });
    return admins.map((a) => a.email);
  }

  /**
   * Invia il riepilogo delle scadenze imminenti. Pubblico per poterlo
   * invocare manualmente (endpoint di test) oltre che dallo scheduler.
   */
  async inviaRiepilogo(): Promise<{ inviata: boolean; scadenze: number; destinatari: number }> {
    if (!this.transporter) {
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
          return `<tr>
            <td style="padding:4px 8px;border:1px solid #ddd">${s.veicolo?.targa || '-'}</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${nomeCliente}</td>
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

      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: destinatari.join(', '),
        subject: `Sissibol: ${scadenze.length} scadenze bolli imminenti`,
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
