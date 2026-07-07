import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { ScadenzeService } from './scadenze.service';

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
  private startTimer?: NodeJS.Timeout;
  private dailyTimer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private scadenzeService: ScadenzeService,
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

    // Pianifica l'invio giornaliero all'ora configurata
    const [ora, minuti] = (process.env.NOTIFICHE_ORA || '07:00')
      .split(':')
      .map((v) => parseInt(v, 10));
    const delay = this.msAllaProssimaOccorrenza(
      Number.isFinite(ora) ? ora : 7,
      Number.isFinite(minuti) ? minuti : 0,
    );

    this.logger.log(
      `Notifiche email attive: prossimo invio tra ${Math.round(delay / 60000)} minuti`,
    );

    this.startTimer = setTimeout(() => {
      void this.inviaRiepilogo();
      this.dailyTimer = setInterval(() => void this.inviaRiepilogo(), 24 * 60 * 60 * 1000);
      this.dailyTimer.unref?.();
    }, delay);
    this.startTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.dailyTimer) clearInterval(this.dailyTimer);
  }

  private msAllaProssimaOccorrenza(ora: number, minuti: number): number {
    const now = new Date();
    const next = new Date(now);
    next.setHours(ora, minuti, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime() - now.getTime();
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
