import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface MessaggioEmail {
  a: string[];
  oggetto: string;
  testo: string;
  html?: string;
  rispondiA?: string;
}

export interface EsitoSpedizione {
  idMessaggio: string | null;
}

/**
 * Chi spedisce le email. L'interfaccia esiste per poter sostituire il server
 * SMTP nei test senza toccare il codice che decide cosa spedire.
 */
export interface Mittente {
  readonly configurato: boolean;
  spedisci(messaggio: MessaggioEmail): Promise<EsitoSpedizione>;
}

/**
 * Accesso unico al server di posta, condiviso da tutti gli invii.
 *
 * Si attiva solo se SMTP_HOST e un mittente (SMTP_FROM o SMTP_USER) sono
 * configurati: senza mittente molti server rifiutano il messaggio, e
 * accorgersene all'invio sarebbe troppo tardi.
 */
@Injectable()
export class MailerService implements Mittente {
  private readonly logger = new Logger(MailerService.name);
  private trasporto: nodemailer.Transporter | null = null;
  private mittente: string | null = null;

  // Configurato nel costruttore e non in onModuleInit: gli altri servizi lo
  // interrogano nel proprio onModuleInit, e l'ordine fra moduli non è garantito.
  constructor() {
    const host = process.env.SMTP_HOST;
    const mittente = process.env.SMTP_FROM || process.env.SMTP_USER || null;
    if (!host) {
      this.logger.log('Invio email disabilitato (SMTP_HOST non configurato)');
      return;
    }
    if (!mittente) {
      this.logger.warn('Invio email disabilitato: configurare SMTP_FROM (o SMTP_USER)');
      return;
    }

    this.mittente = mittente;
    this.trasporto = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
      // Un server che non risponde non deve bloccare un invio per minuti.
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 60_000,
    });
    this.logger.log(`Invio email attivo tramite ${host}`);
  }

  get configurato(): boolean {
    return this.trasporto !== null;
  }

  async spedisci(messaggio: MessaggioEmail): Promise<EsitoSpedizione> {
    if (!this.trasporto) {
      throw new Error('Server di posta non configurato');
    }
    const info = await this.trasporto.sendMail({
      from: this.mittente,
      to: messaggio.a.join(', '),
      replyTo: messaggio.rispondiA,
      subject: messaggio.oggetto,
      text: messaggio.testo,
      html: messaggio.html,
    });
    return { idMessaggio: info?.messageId ?? null };
  }

  /** Verifica connessione e credenziali, senza spedire nulla. */
  async verifica(): Promise<{ ok: boolean; errore?: string }> {
    if (!this.trasporto) {
      return { ok: false, errore: 'Server di posta non configurato' };
    }
    try {
      await this.trasporto.verify();
      return { ok: true };
    } catch (error) {
      return { ok: false, errore: (error as Error).message };
    }
  }
}
