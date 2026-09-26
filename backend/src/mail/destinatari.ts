import { Logger } from '@nestjs/common';

interface ConUtenti {
  utente: { findMany(args: unknown): Promise<{ email: string }[]> };
}

const logger = new Logger('DestinatariStudio');

/**
 * Chi riceve le comunicazioni interne dello studio (riepilogo delle
 * scadenze, allarmi dei backup): NOTIFICHE_EMAIL_TO (lista separata da
 * virgole) o, in mancanza, tutti gli amministratori.
 *
 * Se il database non risponde restano solo gli indirizzi configurati: un
 * allarme deve poter partire proprio quando qualcosa non va.
 */
export async function destinatariStudio(prisma: ConUtenti): Promise<string[]> {
  const configurati = (process.env.NOTIFICHE_EMAIL_TO ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  if (configurati.length) return configurati;
  try {
    const admin = await prisma.utente.findMany({ where: { ruolo: 'ADMIN' }, select: { email: true } });
    return admin.map((a) => a.email);
  } catch (errore) {
    logger.error(`Destinatari non disponibili: ${(errore as Error).message}`);
    return [];
  }
}
