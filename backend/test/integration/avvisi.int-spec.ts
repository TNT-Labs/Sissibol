/**
 * Test di integrazione degli avvisi al cliente.
 *
 * Sapere se e quando un cliente è stato avvisato è il requisito principale
 * dello scadenziario, ed è ciò che si deve poter dimostrare in caso di
 * contestazione. L'archivio Access lo tracciava; la prima migrazione lo aveva
 * perso.
 *
 * AMBITO: qui gli avvisi vengono maturati e registrati. L'invio vero e proprio
 * (email, gestione dei fallimenti di consegna, solleciti) è della fase
 * successiva.
 */

import { AvvisiService, ANTICIPO_AVVISI } from '../../src/avvisi/avvisi.service';
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
  seedTariffario,
} from './setup/test-db';

const ADESSO = '2026-06-15T12:00:00.000Z';

describe('AvvisiService (integrazione)', () => {
  let service: AvvisiService;
  let prisma: ReturnType<typeof getPrisma>;

  beforeAll(() => {
    prisma = getPrisma();
    const bollo = new BolloService(prisma as never);
    const audit = new AuditService(prisma as never);
    const scadenze = new ScadenzeService(prisma as never, bollo, audit);
    service = new AvvisiService(prisma as never, scadenze);
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedTariffario();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  describe('generaAvvisiDovuti', () => {
    it('matura il primo avviso per una scadenza entro i 30 giorni', async () => {
      const cliente = await creaCliente({ email: 'cliente@example.com' });
      const veicolo = await creaVeicolo(cliente.id);
      // 30 giugno: a 15 giorni dalla data di riferimento
      await creaScadenza(veicolo.id, { meseScadenza: 6, annoScadenza: 2026 });

      const esito = await withFrozenTime(ADESSO, () => service.generaAvvisiDovuti());

      expect(esito.avvisiCreati).toBe(1);
      const avvisi = await prisma.avviso.findMany();
      expect(avvisi).toHaveLength(1);
      expect(avvisi[0].tipo).toBe('PRIMO');
      expect(avvisi[0].esito).toBe('DA_INVIARE');
      expect(avvisi[0].destinatario).toBe('cliente@example.com');
      expect(avvisi[0].canale).toBe('EMAIL');
    });

    it('matura anche il secondo avviso sotto i 7 giorni', async () => {
      const cliente = await creaCliente({ email: 'cliente@example.com' });
      const veicolo = await creaVeicolo(cliente.id);
      // 30 giugno con riferimento al 25 giugno: mancano 5 giorni
      await creaScadenza(veicolo.id, { meseScadenza: 6, annoScadenza: 2026 });

      const esito = await withFrozenTime('2026-06-25T12:00:00.000Z', () =>
        service.generaAvvisiDovuti(),
      );

      expect(esito.avvisiCreati).toBe(2);
      const tipi = (await prisma.avviso.findMany({ orderBy: { tipo: 'asc' } })).map(
        (a) => a.tipo,
      );
      expect(tipi.sort()).toEqual(['PRIMO', 'SECONDO']);
    });

    it('è idempotente: rieseguirla non crea doppioni', async () => {
      const cliente = await creaCliente({ email: 'cliente@example.com' });
      const veicolo = await creaVeicolo(cliente.id);
      await creaScadenza(veicolo.id, { meseScadenza: 6, annoScadenza: 2026 });

      const primo = await withFrozenTime(ADESSO, () => service.generaAvvisiDovuti());
      const secondo = await withFrozenTime(ADESSO, () => service.generaAvvisiDovuti());

      expect(primo.avvisiCreati).toBe(1);
      expect(secondo.avvisiCreati).toBe(0);
      expect(secondo.avvisiGiaPresenti).toBe(1);
      expect(await prisma.avviso.count()).toBe(1);
    });

    it('il database impedisce due avvisi dello stesso tipo sulla stessa scadenza', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      const scadenza = await creaScadenza(veicolo.id);

      await prisma.avviso.create({
        data: { idScadenza: scadenza.id, tipo: 'PRIMO', destinatario: 'a@b.it' },
      });

      await expect(
        prisma.avviso.create({
          data: { idScadenza: scadenza.id, tipo: 'PRIMO', destinatario: 'a@b.it' },
        }),
      ).rejects.toThrow();
    });

    it('conta le scadenze senza recapito invece di ignorarle', async () => {
      // Un cliente senza email è un dato da sanare: va reso visibile, non
      // saltato in silenzio.
      const cliente = await creaCliente({ email: null });
      const veicolo = await creaVeicolo(cliente.id);
      await creaScadenza(veicolo.id, { meseScadenza: 6, annoScadenza: 2026 });

      const esito = await withFrozenTime(ADESSO, () => service.generaAvvisiDovuti());

      expect(esito.avvisiCreati).toBe(0);
      expect(esito.senzaDestinatario).toBe(1);
      expect(await prisma.avviso.count()).toBe(0);
    });

    it('non matura avvisi per scadenze già pagate', async () => {
      const cliente = await creaCliente({ email: 'cliente@example.com' });
      const veicolo = await creaVeicolo(cliente.id);
      await creaScadenza(veicolo.id, {
        meseScadenza: 6,
        annoScadenza: 2026,
        stato: 'PAGATO',
      });

      const esito = await withFrozenTime(ADESSO, () => service.generaAvvisiDovuti());

      expect(esito.avvisiCreati).toBe(0);
    });

    it('non matura avvisi per scadenze oltre la finestra', async () => {
      const cliente = await creaCliente({ email: 'cliente@example.com' });
      const veicolo = await creaVeicolo(cliente.id);
      await creaScadenza(veicolo.id, { meseScadenza: 12, annoScadenza: 2026 });

      const esito = await withFrozenTime(ADESSO, () => service.generaAvvisiDovuti());

      expect(esito.avvisiCreati).toBe(0);
      expect(esito.scadenzeEsaminate).toBe(0);
    });

    it('usa gli anticipi dichiarati dal servizio', () => {
      // Le finestre sono allineate alla pratica dell'archivio storico.
      expect(ANTICIPO_AVVISI.PRIMO).toBe(30);
      expect(ANTICIPO_AVVISI.SECONDO).toBe(7);
    });
  });

  describe('esito dell\'invio', () => {
    it('registra l\'invio con la data', async () => {
      const cliente = await creaCliente({ email: 'cliente@example.com' });
      const veicolo = await creaVeicolo(cliente.id);
      const scadenza = await creaScadenza(veicolo.id);
      const avviso = await prisma.avviso.create({
        data: { idScadenza: scadenza.id, tipo: 'PRIMO', destinatario: 'a@b.it' },
      });

      const aggiornato = await service.marcaInviato(
        avviso.id,
        new Date('2026-06-15T09:30:00Z'),
      );

      expect(aggiornato.esito).toBe('INVIATO');
      expect(aggiornato.dataInvio.toISOString().slice(0, 10)).toBe('2026-06-15');
    });

    it('registra l\'errore di invio conservando il messaggio', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      const scadenza = await creaScadenza(veicolo.id);
      const avviso = await prisma.avviso.create({
        data: { idScadenza: scadenza.id, tipo: 'PRIMO', destinatario: 'a@b.it' },
      });

      const aggiornato = await service.marcaErrore(avviso.id, 'Mailbox inesistente');

      expect(aggiornato.esito).toBe('ERRORE');
      expect(aggiornato.errore).toBe('Mailbox inesistente');
      expect(aggiornato.dataInvio).toBeNull();
    });

    it('il database rifiuta un avviso INVIATO senza data', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      const scadenza = await creaScadenza(veicolo.id);

      await expect(
        prisma.avviso.create({
          data: {
            idScadenza: scadenza.id,
            tipo: 'PRIMO',
            esito: 'INVIATO',
            dataInvio: null,
          },
        }),
      ).rejects.toThrow(/avvisi_inviato_ha_data/);
    });

    it('gli avvisi in sospeso escono ordinati per scadenza più vicina', async () => {
      const cliente = await creaCliente({ email: 'cliente@example.com' });
      const veicolo = await creaVeicolo(cliente.id);
      const lontana = await creaScadenza(veicolo.id, { meseScadenza: 11, annoScadenza: 2026 });
      const vicina = await creaScadenza(veicolo.id, { meseScadenza: 6, annoScadenza: 2026 });

      await prisma.avviso.createMany({
        data: [
          { idScadenza: lontana.id, tipo: 'PRIMO', destinatario: 'a@b.it' },
          { idScadenza: vicina.id, tipo: 'PRIMO', destinatario: 'a@b.it' },
        ],
      });

      const sospesi = await service.inSospeso();

      expect(sospesi.map((a) => a.idScadenza)).toEqual([vicina.id, lontana.id]);
    });
  });

  describe('storico degli avvisi', () => {
    it('conserva gli avvisi recuperati dall\'archivio', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      const scadenza = await creaScadenza(veicolo.id, {
        meseScadenza: 9,
        annoScadenza: 2010,
        stato: 'PAGATO',
      });

      await prisma.avviso.create({
        data: {
          idScadenza: scadenza.id,
          tipo: 'PRIMO',
          canale: 'ARCHIVIO',
          dataInvio: new Date(Date.UTC(2010, 9, 4)),
          esito: 'INVIATO',
          note: "Recuperato dall'archivio Access",
        },
      });

      const storico = await service.perScadenza(scadenza.id);

      expect(storico).toHaveLength(1);
      expect(storico[0].canale).toBe('ARCHIVIO');
      expect(storico[0].dataInvio.toISOString().slice(0, 10)).toBe('2010-10-04');
    });

    it('elimina gli avvisi quando si elimina la scadenza', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      const scadenza = await creaScadenza(veicolo.id);
      await prisma.avviso.create({
        data: { idScadenza: scadenza.id, tipo: 'PRIMO' },
      });

      await prisma.scadenza.delete({ where: { id: scadenza.id } });

      expect(await prisma.avviso.count()).toBe(0);
    });
  });
});
