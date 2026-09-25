import { AllarmeBackupService, MINUTI_DI_TOLLERANZA_ALL_AVVIO } from './allarme-backup.service';
import type { StatoBackup } from './stato-backup';
import type { MessaggioEmail } from '../mail/mailer.service';

const errore: StatoBackup = {
  livello: 'ERRORE',
  messaggio: 'Nessun backup riuscito da 31 ore.',
  ultimoTentativo: { quando: '2026-10-02T00:30:00Z', esito: 'ERRORE', errore: 'pg_dump non riuscito: connection refused' },
  ultimoRiuscito: { quando: '2026-09-30T23:30:00Z', file: 'sissibol-20261001-013000.dump', dimensioneByte: 2_000_000 },
  backupConservati: 14,
  ora: '02:30',
};
const ok: StatoBackup = { ...errore, livello: 'OK', messaggio: 'Backup regolari.' };

function prepara() {
  const spedite: MessaggioEmail[] = [];
  let stato = errore;
  let fallisci = false;
  const mailer = {
    configurato: true,
    spedisci: async (m: MessaggioEmail) => {
      if (fallisci) throw new Error('SMTP non raggiungibile');
      spedite.push(m);
      return { idMessaggio: '1' };
    },
  };
  const sistema = { statoBackup: async () => stato };
  const prisma = { utente: { findMany: async () => [{ email: 'admin@studio.it' }] } };
  const servizio = new AllarmeBackupService(sistema as never, mailer as never, prisma as never);
  const avvio = (servizio as unknown as { avvio: Date }).avvio;
  const dopo = (minuti: number) => new Date(avvio.getTime() + minuti * 60_000);
  return {
    servizio,
    spedite,
    dopo,
    imposta: (s: StatoBackup) => (stato = s),
    fallisci: (v: boolean) => (fallisci = v),
  };
}

describe('AllarmeBackupService', () => {
  const ambiente = { ...process.env };
  beforeEach(() => {
    process.env.BACKUP_STATO_FILE = '/backups/stato.json';
    process.env.NOTIFICHE_EMAIL_TO = 'studio@example.it, titolare@example.it';
    process.env.APP_FUSO_ORARIO = 'Europe/Rome';
  });
  afterAll(() => {
    process.env = ambiente;
  });

  it('nei primi minuti dopo l\'avvio non controlla (primo backup in corso)', async () => {
    const t = prepara();
    expect(await t.servizio.controlla(t.dopo(MINUTI_DI_TOLLERANZA_ALL_AVVIO - 1))).toBeNull();
    expect(t.spedite).toHaveLength(0);
  });

  it('allarme, poi silenzio, promemoria dopo 24 ore e ripristino', async () => {
    const t = prepara();
    expect(await t.servizio.controlla(t.dopo(30))).toBe('ALLARME');
    expect(t.spedite[0].a).toEqual(['studio@example.it', 'titolare@example.it']);
    expect(t.spedite[0].oggetto).toBe('Sissibol: backup non riusciti');
    expect(t.spedite[0].testo).toContain('Nessun backup riuscito da 31 ore.');
    expect(t.spedite[0].testo).toContain('Errore: pg_dump non riuscito: connection refused');
    expect(t.spedite[0].testo).toMatch(/Ultimo backup riuscito: giovedì 1 ottobre 2026/);

    expect(await t.servizio.controlla(t.dopo(60))).toBeNull();
    expect(await t.servizio.controlla(t.dopo(30 + 24 * 60))).toBe('PROMEMORIA');
    expect(t.spedite[1].oggetto).toContain('(promemoria)');

    t.imposta(ok);
    expect(await t.servizio.controlla(t.dopo(30 + 25 * 60))).toBe('RIPRISTINO');
    expect(t.spedite[2].oggetto).toBe('Sissibol: backup di nuovo regolari');
    expect(await t.servizio.controlla(t.dopo(30 + 26 * 60))).toBeNull();
    expect(t.spedite).toHaveLength(3);
  });

  it('se la spedizione fallisce riprova al controllo successivo', async () => {
    const t = prepara();
    t.fallisci(true);
    expect(await t.servizio.controlla(t.dopo(30))).toBeNull();
    t.fallisci(false);
    expect(await t.servizio.controlla(t.dopo(60))).toBe('ALLARME');
  });

  it('senza NOTIFICHE_EMAIL_TO avvisa gli amministratori; senza posta o backup configurati non fa nulla', async () => {
    delete process.env.NOTIFICHE_EMAIL_TO;
    const t = prepara();
    await t.servizio.controlla(t.dopo(30));
    expect(t.spedite[0].a).toEqual(['admin@studio.it']);

    delete process.env.BACKUP_STATO_FILE;
    const senzaBackup = prepara();
    expect(await senzaBackup.servizio.controlla(senzaBackup.dopo(30))).toBeNull();
  });
});
