import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { valutaBackup, StatoBackup } from './stato-backup';

const AVVIO = new Date();

/** Versione dell'applicazione: il processo parte con node, non con npm. */
const VERSIONE: string | null = (() => {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')).version ?? null;
  } catch {
    return null;
  }
})();

/**
 * Salute e stato dell'installazione: database, backup, posta.
 *
 * Il percorso dello stato dei backup (BACKUP_STATO_FILE) è impostato dai
 * compose, che montano la cartella dei backup in sola lettura. Senza, i
 * backup risultano "non configurati" invece che in errore: è il caso di un
 * ambiente di sviluppo.
 */
@Injectable()
export class SistemaService {
  private readonly logger = new Logger(SistemaService.name);

  constructor(
    private prisma: PrismaService,
    private mailer: MailerService,
  ) {}

  async databaseRaggiungibile(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error(`Database non raggiungibile: ${(error as Error).message}`);
      return false;
    }
  }

  async statoBackup(adesso = new Date()): Promise<StatoBackup> {
    const percorso = process.env.BACKUP_STATO_FILE;
    if (!percorso) return valutaBackup(null, false, adesso);
    let contenuto: string | null = null;
    try {
      contenuto = await readFile(percorso, 'utf-8');
    } catch {
      contenuto = null;
    }
    return valutaBackup(contenuto, true, adesso);
  }

  async stato() {
    const [database, backup] = await Promise.all([this.databaseRaggiungibile(), this.statoBackup()]);
    return {
      database: { raggiungibile: database },
      backup,
      posta: { configurata: this.mailer.configurato },
      avviato: AVVIO.toISOString(),
      versione: VERSIONE,
    };
  }
}
