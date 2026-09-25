/**
 * Test di integrazione dell'invio degli avvisi al cliente.
 *
 * Il server di posta è sostituito da un mittente finto; tutto il resto —
 * presa in carico, raggruppamento, ritentativi, recupero degli invii
 * interrotti — gira sul database reale, perché le garanzie contro i doppi
 * invii stanno negli aggiornamenti condizionati e non si possono verificare
 * con un mock.
 */

import { AvvisiService } from '../../src/avvisi/avvisi.service';
import { AvvisiInvioService } from '../../src/avvisi/avvisi-invio.service';
import { leggiConfigurazioneAvvisi } from '../../src/avvisi/configurazione';
import { MAX_TENTATIVI, MESSAGGIO_ESITO_INCERTO, MOTIVO_ASSORBITO } from '../../src/avvisi/regole-invio';
import type { EsitoSpedizione, MessaggioEmail, Mittente } from '../../src/mail/mailer.service';
import { ScadenzeService } from '../../src/scadenze/scadenze.service';
import { BolloService } from '../../src/bollo/bollo.service';
import { AuditService } from '../../src/audit/audit.service';
import { withFrozenTime } from '../helpers/frozen-time';
import {
  creaCliente,
  creaScadenza,
  creaVeicolo,
  disconnectPrisma,
  getPrisma,
  resetDatabase,
} from './setup/test-db';

// Le scadenze di prova cadono il 30 giugno 2026: a 15 giorni da qui.
const ADESSO = '2026-06-15T12:00:00.000Z';

class MittenteFinto implements Mittente {
  configurato = true;
  spediti: MessaggioEmail[] = [];
  /** Errori da lanciare, uno per spedizione, prima di tornare a riuscire */
  errori: unknown[] = [];
  ritardoMs = 0;

  async spedisci(messaggio: MessaggioEmail): Promise<EsitoSpedizione> {
    if (this.ritardoMs) await new Promise((r) => setTimeout(r, this.ritardoMs));
    const errore = this.errori.shift();
    if (errore) throw errore;
    this.spediti.push(messaggio);
    return { idMessaggio: `<${this.spediti.length}@test.local>` };
  }
}

const erroreSmtp = (code: string, responseCode?: number, response?: string) =>
  Object.assign(new Error(response ?? code), { code, responseCode, response });

describe('Invio degli avvisi (integrazione)', () => {
  const prisma = getPrisma();
  const audit = new AuditService(prisma as never);
  const scadenze = new ScadenzeService(prisma as never, new BolloService(prisma as never, audit), audit);
  const avvisi = new AvvisiService(prisma as never, scadenze, audit);
  const configurazione = leggiConfigurazioneAvvisi({ AVVISI_FIRMA: 'Studio Test' });

  let mittente: MittenteFinto;
  let invio: AvvisiInvioService;

  const nuovoInvio = (m: Mittente = mittente, c = configurazione) =>
    new AvvisiInvioService(prisma as never, m, c);

  beforeEach(async () => {
    await resetDatabase();
    mittente = new MittenteFinto();
    invio = nuovoInvio();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  /** Cliente con veicoli in scadenza il 30 giugno e avvisi maturati. */
  async function clienteConScadenze(
    targhe: string[],
    cliente: Parameters<typeof creaCliente>[0] = {},
  ) {
    const c = await creaCliente({ email: 'cliente@example.com', ...cliente });
    const scad = [];
    for (const targa of targhe) {
      const v = await creaVeicolo(c.id, { targa });
      scad.push(await creaScadenza(v.id, { meseScadenza: 6, annoScadenza: 2026 }));
    }
    return { cliente: c, scadenze: scad };
  }

  const matura = (quando = ADESSO) => withFrozenTime(quando, () => avvisi.generaAvvisiDovuti());
  const invia = (quando = ADESSO, servizio = invio) =>
    withFrozenTime(quando, () => servizio.inviaDovuti());

  describe('invio riuscito', () => {
    it('invia un\'email per cliente con tutti i suoi veicoli, e ne registra la prova', async () => {
      const a = await clienteConScadenze(['AA111AA', 'BB222BB'], {
        ragioneSociale: 'Alfa Srl',
        email: 'alfa@example.com',
      });
      await clienteConScadenze(['CC333CC'], { ragioneSociale: 'Beta Srl', email: 'beta@example.com' });
      await matura();

      const esito = await invia();

      expect(esito).toMatchObject({ emailInviate: 2, avvisiInviati: 3, errori: 0, interrotto: null });
      expect(mittente.spediti.map((m) => m.a)).toEqual([['alfa@example.com'], ['beta@example.com']]);
      const alfa = mittente.spediti[0];
      expect(alfa.oggetto).toBe('Scadenza bollo di 2 veicoli');
      expect(alfa.testo).toContain('Gentile Alfa Srl,');
      expect(alfa.testo).toContain('AA111AA');
      expect(alfa.testo).toContain('BB222BB');
      expect(alfa.testo).toContain('Studio Test');

      const registrati = await prisma.avviso.findMany({
        where: { scadenza: { veicolo: { idCliente: a.cliente.id } } },
      });
      for (const avviso of registrati) {
        expect(avviso.esito).toBe('INVIATO');
        expect(avviso.dataInvio.toISOString().slice(0, 10)).toBe('2026-06-15');
        expect(avviso.inviatoIl.toISOString()).toBe(ADESSO);
        expect(avviso.idMessaggio).toBe('<1@test.local>');
        expect(avviso.destinatario).toBe('alfa@example.com');
        expect(avviso.oggetto).toBe(alfa.oggetto);
        expect(avviso.testo).toBe(alfa.testo);
        expect(avviso.tentativi).toBe(0);
      }
    });

    it('non invia due volte: una seconda esecuzione non spedisce nulla', async () => {
      await clienteConScadenze(['AA111AA']);
      await matura();

      await invia();
      const seconda = await invia();

      expect(mittente.spediti).toHaveLength(1);
      expect(seconda.emailInviate).toBe(0);
    });

    it('usa il recapito attuale del cliente, non quello di quando l\'avviso è maturato', async () => {
      const { cliente } = await clienteConScadenze(['AA111AA'], { email: 'vecchio@example.com' });
      await matura();
      await prisma.cliente.update({ where: { id: cliente.id }, data: { email: 'nuovo@example.com' } });

      await invia();

      expect(mittente.spediti[0].a).toEqual(['nuovo@example.com']);
      expect((await prisma.avviso.findFirst()).destinatario).toBe('nuovo@example.com');
    });

    it('scrive a tutti gli indirizzi validi del cliente', async () => {
      await clienteConScadenze(['AA111AA']);
      await matura();
      await prisma.cliente.updateMany({ data: { email: 'a@example.com; b@example.com' } });

      await invia();

      expect(mittente.spediti[0].a).toEqual(['a@example.com', 'b@example.com']);
    });

    it('con primo e secondo avviso maturati insieme spedisce solo il primo, con il testo normale', async () => {
      await clienteConScadenze(['AA111AA']);
      // A 5 giorni dalla scadenza maturano entrambi: il secondo nasce assorbito.
      const maturazione = await matura('2026-06-25T12:00:00.000Z');
      expect(maturazione).toMatchObject({ avvisiCreati: 1, assorbiti: 1 });

      const esito = await invia('2026-06-25T12:00:00.000Z');

      expect(esito).toMatchObject({ emailInviate: 1, avvisiInviati: 1 });
      expect(mittente.spediti[0].oggetto).toBe('Scadenza bollo veicolo AA111AA il 30/06/2026');
      expect(mittente.spediti[0].testo).not.toContain('secondo promemoria');
      expect(await prisma.avviso.findFirst({ where: { tipo: 'PRIMO' } })).toMatchObject({ esito: 'INVIATO' });
      expect(await prisma.avviso.findFirst({ where: { tipo: 'SECONDO' } })).toMatchObject({
        esito: 'ANNULLATO',
        note: MOTIVO_ASSORBITO,
      });
    });

    it('un primo avviso rimasto in coda assorbe il secondo maturato dopo', async () => {
      await clienteConScadenze(['AA111AA']);
      await matura(); // 15 giorni prima: solo il primo, che non viene inviato
      await matura('2026-06-25T12:00:00.000Z'); // 5 giorni prima: matura il secondo
      expect(await prisma.avviso.count({ where: { esito: 'DA_INVIARE' } })).toBe(2);

      const esito = await invia('2026-06-25T12:00:00.000Z');

      expect(esito).toMatchObject({ emailInviate: 1, avvisiInviati: 1, annullati: 1 });
      expect(mittente.spediti[0].oggetto).not.toMatch(/Secondo avviso/);
      expect(await prisma.avviso.findFirst({ where: { tipo: 'SECONDO' } })).toMatchObject({
        esito: 'ANNULLATO',
        note: MOTIVO_ASSORBITO,
      });
    });

    it('dopo il primo avviso inviato, il secondo parte come secondo promemoria', async () => {
      await clienteConScadenze(['AA111AA']);
      await matura();
      await invia();
      await matura('2026-06-25T12:00:00.000Z');

      const esito = await invia('2026-06-25T12:00:00.000Z');

      expect(esito.emailInviate).toBe(1);
      expect(mittente.spediti).toHaveLength(2);
      expect(mittente.spediti[1].oggetto).toBe('Secondo avviso: scadenza bollo veicolo AA111AA il 30/06/2026');
      expect(mittente.spediti[1].testo).toContain('Questo è un secondo promemoria.');
    });

    it('rispetta il limite di email per esecuzione, avvisando prima le scadenze più vicine', async () => {
      const lontano = await creaCliente({ email: 'lontano@example.com' });
      const v = await creaVeicolo(lontano.id);
      await creaScadenza(v.id, { meseScadenza: 7, annoScadenza: 2026 });
      await prisma.scadenza.updateMany({
        where: { idVeicolo: v.id },
        // 10 luglio: dentro la finestra dei 30 giorni, dopo il 30 giugno
        data: { dataScadenza: new Date(Date.UTC(2026, 6, 10)), meseScadenza: 7 },
      });
      await clienteConScadenze(['AA111AA'], { email: 'vicino1@example.com' });
      await clienteConScadenze(['BB222BB'], { email: 'vicino2@example.com' });
      await matura();

      const esito = await withFrozenTime(ADESSO, () => invio.inviaDovuti({ limiteEmail: 2 }));

      expect(esito).toMatchObject({ emailInviate: 2, clientiRimandati: 1 });
      expect(mittente.spediti.flatMap((m) => m.a).sort()).toEqual([
        'vicino1@example.com',
        'vicino2@example.com',
      ]);
      expect(await prisma.avviso.count({ where: { esito: 'DA_INVIARE' } })).toBe(1);
    });
  });

  describe('avvisi da non inviare più', () => {
    it('annulla l\'avviso di una scadenza pagata dopo la maturazione', async () => {
      const { scadenze: [s] } = await clienteConScadenze(['AA111AA']);
      await matura();
      await prisma.scadenza.update({ where: { id: s.id }, data: { stato: 'PAGATO' } });

      const esito = await invia();

      expect(esito).toMatchObject({ emailInviate: 0, annullati: 1 });
      expect(mittente.spediti).toHaveLength(0);
      const avviso = await prisma.avviso.findFirst();
      expect(avviso.esito).toBe('ANNULLATO');
      expect(avviso.note).toBe('Scadenza già pagata');
    });

    it('annulla se il cliente ha chiesto di non ricevere avvisi', async () => {
      const { cliente } = await clienteConScadenze(['AA111AA']);
      await matura();
      await prisma.cliente.update({ where: { id: cliente.id }, data: { avvisiEmail: false } });

      await invia();

      expect(mittente.spediti).toHaveLength(0);
      expect((await prisma.avviso.findFirst()).esito).toBe('ANNULLATO');
    });

    it('segnala in errore l\'avviso di un cliente rimasto senza recapito', async () => {
      const { cliente } = await clienteConScadenze(['AA111AA']);
      await matura();
      await prisma.cliente.update({ where: { id: cliente.id }, data: { email: null } });

      const esito = await invia();

      expect(esito.errori).toBe(1);
      const avviso = await prisma.avviso.findFirst();
      expect(avviso.esito).toBe('ERRORE');
      expect(avviso.errore).toBe('Recapito email del cliente mancante o non valido');
    });

    it('non invia mai gli avvisi recuperati dall\'archivio', async () => {
      const { scadenze: [s] } = await clienteConScadenze(['AA111AA']);
      await prisma.avviso.create({
        data: { idScadenza: s.id, tipo: 'PRIMO', canale: 'ARCHIVIO', esito: 'DA_INVIARE' },
      });

      await invia();

      expect(mittente.spediti).toHaveLength(0);
      expect((await prisma.avviso.findFirst()).esito).toBe('DA_INVIARE');
    });
  });

  describe('riconciliazione della coda senza invio', () => {
    it('chiude gli avvisi non più dovuti anche senza server di posta', async () => {
      const { scadenze: [pagata] } = await clienteConScadenze(['AA111AA']);
      await clienteConScadenze(['BB222BB'], { email: 'b@example.com' });
      await matura();
      await prisma.scadenza.update({ where: { id: pagata.id }, data: { stato: 'PAGATO' } });
      mittente.configurato = false;

      const esito = await withFrozenTime(ADESSO, () => invio.riconciliaCoda());

      expect(esito).toEqual({ annullati: 1, errori: 0 });
      expect(mittente.spediti).toHaveLength(0);
      const stati = await prisma.avviso.findMany({ orderBy: { id: 'asc' } });
      expect(stati.map((a) => a.esito)).toEqual(['ANNULLATO', 'DA_INVIARE']);
    });

    it('chiude anche gli avvisi in attesa di un nuovo tentativo, se non più dovuti', async () => {
      const { scadenze: [s] } = await clienteConScadenze(['AA111AA']);
      await matura();
      await prisma.avviso.updateMany({
        data: { tentativi: 1, prossimoTentativo: new Date('2026-06-16T00:00:00Z') },
      });
      await prisma.scadenza.update({ where: { id: s.id }, data: { stato: 'PAGATO' } });

      await withFrozenTime(ADESSO, () => invio.riconciliaCoda());

      expect((await prisma.avviso.findFirst()).esito).toBe('ANNULLATO');
    });
  });

  describe('errori del server di posta', () => {
    it('un errore temporaneo lascia l\'avviso in coda con un nuovo tentativo più tardi', async () => {
      await clienteConScadenze(['AA111AA']);
      await matura();
      mittente.errori.push(erroreSmtp('EENVELOPE', 451, '451 Try again later'));

      const esito = await invia();

      expect(esito.daRitentare).toBe(1);
      let avviso = await prisma.avviso.findFirst();
      expect(avviso).toMatchObject({ esito: 'DA_INVIARE', tentativi: 1, errore: '451 Try again later' });
      expect(avviso.prossimoTentativo.toISOString()).toBe('2026-06-15T13:00:00.000Z');

      // Prima dell'attesa non si ritenta...
      await invia('2026-06-15T12:30:00.000Z');
      expect(mittente.spediti).toHaveLength(0);

      // ...dopo sì, e l'invio riuscito pulisce l'errore.
      await invia('2026-06-15T13:01:00.000Z');
      expect(mittente.spediti).toHaveLength(1);
      avviso = await prisma.avviso.findFirst();
      expect(avviso).toMatchObject({ esito: 'INVIATO', errore: null, prossimoTentativo: null, tentativi: 1 });
    });

    it(`dopo ${MAX_TENTATIVI} errori temporanei l'avviso passa in errore`, async () => {
      await clienteConScadenze(['AA111AA']);
      await matura();
      for (let i = 0; i < MAX_TENTATIVI; i++) {
        mittente.errori.push(erroreSmtp('EENVELOPE', 452, '452 Mailbox full'));
      }

      await invia('2026-06-15T09:00:00.000Z');
      await invia('2026-06-15T10:01:00.000Z');
      await invia('2026-06-15T16:02:00.000Z');

      const avviso = await prisma.avviso.findFirst();
      expect(avviso).toMatchObject({ esito: 'ERRORE', tentativi: MAX_TENTATIVI, prossimoTentativo: null });
    });

    it('un rifiuto definitivo del destinatario manda subito l\'avviso in errore', async () => {
      await clienteConScadenze(['AA111AA']);
      await matura();
      mittente.errori.push(erroreSmtp('EENVELOPE', 550, '550 5.1.1 User unknown'));

      const esito = await invia();

      expect(esito.errori).toBe(1);
      expect(await prisma.avviso.findFirst()).toMatchObject({
        esito: 'ERRORE',
        tentativi: 1,
        errore: '550 5.1.1 User unknown',
      });
    });

    it('un guasto del server interrompe l\'invio senza consumare i tentativi', async () => {
      await clienteConScadenze(['AA111AA'], { email: 'a@example.com' });
      await clienteConScadenze(['BB222BB'], { email: 'b@example.com' });
      await matura();
      mittente.errori.push(erroreSmtp('EAUTH', 535, '535 Authentication failed'));

      const esito = await invia();

      expect(esito.interrotto).toBe('535 Authentication failed');
      expect(esito.emailInviate).toBe(0);
      // Il secondo cliente non è stato nemmeno tentato.
      expect(mittente.spediti).toHaveLength(0);
      const tutti = await prisma.avviso.findMany();
      expect(tutti.every((a) => a.esito === 'DA_INVIARE' && a.tentativi === 0)).toBe(true);

      // Riparato il server, il giro successivo li invia tutti.
      await invia();
      expect(mittente.spediti).toHaveLength(2);
    });
  });

  describe('invii interrotti e concorrenti', () => {
    it('un avviso rimasto IN_INVIO da un invio interrotto diventa incerto, e non viene rispedito', async () => {
      await clienteConScadenze(['AA111AA']);
      await matura();
      // Simula un processo fermato dopo la presa in carico, 20 minuti fa.
      await prisma.$executeRawUnsafe(
        `UPDATE "avvisi" SET "esito" = 'IN_INVIO', "updatedAt" = '2026-06-15 11:40:00'`,
      );

      const esito = await invia();

      expect(esito.recuperatiIncerti).toBe(1);
      expect(mittente.spediti).toHaveLength(0);
      expect(await prisma.avviso.findFirst()).toMatchObject({
        esito: 'ERRORE',
        errore: MESSAGGIO_ESITO_INCERTO,
      });
    });

    it('non tocca un avviso preso in carico da poco da un altro invio', async () => {
      await clienteConScadenze(['AA111AA']);
      await matura();
      await prisma.$executeRawUnsafe(
        `UPDATE "avvisi" SET "esito" = 'IN_INVIO', "updatedAt" = '2026-06-15 11:55:00'`,
      );

      const esito = await invia();

      expect(esito.recuperatiIncerti).toBe(0);
      expect(mittente.spediti).toHaveLength(0);
      expect((await prisma.avviso.findFirst()).esito).toBe('IN_INVIO');
    });

    it('due invii concorrenti non spediscono mai lo stesso avviso due volte', async () => {
      for (let i = 0; i < 6; i++) {
        await clienteConScadenze([`AA${i}00AA`, `BB${i}00BB`], { email: `cliente${i}@example.com` });
      }
      await matura();
      // Due istanze distinte, come due processi: il blocco in memoria non le
      // protegge, deve farlo la presa in carico sul database.
      const lento = new MittenteFinto();
      lento.ritardoMs = 20;
      const altro = nuovoInvio(lento);
      mittente.ritardoMs = 20;

      const [e1, e2] = await withFrozenTime(ADESSO, () =>
        Promise.all([invio.inviaDovuti(), altro.inviaDovuti()]),
      );

      expect(e1.avvisiInviati + e2.avvisiInviati).toBe(12);
      const spediti = [...mittente.spediti, ...lento.spediti];
      const targhe = spediti.flatMap((m) => m.testo.match(/[A-Z]{2}\d00[A-Z]{2}/g) ?? []);
      expect(targhe).toHaveLength(12);
      expect(new Set(targhe).size).toBe(12);
      expect(await prisma.avviso.count({ where: { esito: 'INVIATO' } })).toBe(12);
    });

    it('nello stesso processo un secondo invio mentre il primo è in corso non parte', async () => {
      await clienteConScadenze(['AA111AA']);
      await matura();
      mittente.ritardoMs = 50;

      const [primo, secondo] = await withFrozenTime(ADESSO, () =>
        Promise.all([invio.inviaDovuti(), invio.inviaDovuti()]),
      );

      expect(primo.emailInviate).toBe(1);
      expect(secondo.giaInCorso).toBe(true);
      expect(mittente.spediti).toHaveLength(1);
    });

    it('senza server di posta configurato non cambia nulla', async () => {
      await clienteConScadenze(['AA111AA']);
      await matura();
      mittente.configurato = false;

      const esito = await invia();

      expect(esito.smtpNonConfigurato).toBe(true);
      expect((await prisma.avviso.findFirst()).esito).toBe('DA_INVIARE');
    });
  });

  describe('anteprima', () => {
    it('mostra l\'email che partirebbe, con tutti gli avvisi del cliente', async () => {
      await clienteConScadenze(['AA111AA', 'BB222BB']);
      await matura();
      const primo = await prisma.avviso.findFirst({ orderBy: { id: 'asc' } });

      const anteprima = await withFrozenTime(ADESSO, () => invio.anteprima(primo.id));

      expect(anteprima.inviato).toBe(false);
      expect(anteprima.destinatari).toEqual(['cliente@example.com']);
      expect(anteprima.avvisi).toHaveLength(2);
      expect(anteprima.email.oggetto).toBe('Scadenza bollo di 2 veicoli');
      expect(mittente.spediti).toHaveLength(0);
      expect((await prisma.avviso.findFirst({ where: { id: primo.id } })).esito).toBe('DA_INVIARE');
    });

    it('per un avviso già inviato restituisce il contenuto effettivamente spedito', async () => {
      await clienteConScadenze(['AA111AA']);
      await matura();
      await invia();
      const avviso = await prisma.avviso.findFirst();

      const anteprima = await invio.anteprima(avviso.id);

      expect(anteprima.inviato).toBe(true);
      expect(anteprima.email.testo).toBe(mittente.spediti[0].testo);
    });

    it('spiega perché un avviso non partirebbe', async () => {
      const { scadenze: [s] } = await clienteConScadenze(['AA111AA']);
      await matura();
      await prisma.scadenza.update({ where: { id: s.id }, data: { stato: 'PAGATO' } });
      const avviso = await prisma.avviso.findFirst();

      const anteprima = await withFrozenTime(ADESSO, () => invio.anteprima(avviso.id));

      expect(anteprima.email).toBeNull();
      expect(anteprima.motivo).toBe('Scadenza già pagata');
    });
  });

  describe('il database', () => {
    it('rifiuta un numero di tentativi negativo', async () => {
      const { scadenze: [s] } = await clienteConScadenze(['AA111AA']);
      await expect(
        prisma.avviso.create({ data: { idScadenza: s.id, tipo: 'PRIMO', tentativi: -1 } }),
      ).rejects.toThrow(/avvisi_tentativi_non_negativi/);
    });
  });
});
