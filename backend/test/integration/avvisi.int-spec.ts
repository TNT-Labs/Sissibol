/**
 * Test di integrazione degli avvisi al cliente.
 *
 * Sapere se e quando un cliente è stato avvisato è il requisito principale
 * dello scadenziario, ed è ciò che si deve poter dimostrare in caso di
 * contestazione. L'archivio Access lo tracciava; la prima migrazione lo aveva
 * perso.
 *
 * Qui la maturazione e la gestione manuale; l'invio è in invio-avvisi.int-spec.ts.
 */

import { AvvisiService, ANTICIPO_AVVISI } from '../../src/avvisi/avvisi.service';
import { MOTIVO_ASSORBITO } from '../../src/avvisi/regole-invio';
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
    const audit = new AuditService(prisma as never);
    const bollo = new BolloService(prisma as never, audit);
    const scadenze = new ScadenzeService(prisma as never, bollo, audit);
    service = new AvvisiService(prisma as never, scadenze, audit);
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

    it('sotto i 7 giorni, senza un primo avviso, il secondo nasce assorbito dal primo', async () => {
      const cliente = await creaCliente({ email: 'cliente@example.com' });
      const veicolo = await creaVeicolo(cliente.id);
      // 30 giugno con riferimento al 25 giugno: mancano 5 giorni
      await creaScadenza(veicolo.id, { meseScadenza: 6, annoScadenza: 2026 });

      const esito = await withFrozenTime('2026-06-25T12:00:00.000Z', () =>
        service.generaAvvisiDovuti(),
      );

      // Il cliente deve ricevere un solo avviso, non un "secondo" senza il primo.
      expect(esito).toMatchObject({ avvisiCreati: 1, assorbiti: 1 });
      const avvisi = await prisma.avviso.findMany({ orderBy: { tipo: 'asc' } });
      expect(avvisi.map((a) => [a.tipo, a.esito])).toEqual([
        ['PRIMO', 'DA_INVIARE'],
        ['SECONDO', 'ANNULLATO'],
      ]);
      expect(avvisi[1].note).toBe(MOTIVO_ASSORBITO);
    });

    it('sotto i 7 giorni, con il primo già presente, matura il secondo da inviare', async () => {
      const cliente = await creaCliente({ email: 'cliente@example.com' });
      const veicolo = await creaVeicolo(cliente.id);
      await creaScadenza(veicolo.id, { meseScadenza: 6, annoScadenza: 2026 });
      await withFrozenTime(ADESSO, () => service.generaAvvisiDovuti());

      const esito = await withFrozenTime('2026-06-25T12:00:00.000Z', () =>
        service.generaAvvisiDovuti(),
      );

      expect(esito).toMatchObject({ avvisiCreati: 1, avvisiGiaPresenti: 1, assorbiti: 0 });
      expect(await prisma.avviso.count({ where: { esito: 'DA_INVIARE' } })).toBe(2);
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

  describe('maturazione: recapiti e scelte del cliente', () => {
    it('non matura avvisi per il cliente che ha scelto di non riceverli', async () => {
      const cliente = await creaCliente({ email: 'cliente@example.com', avvisiEmail: false });
      const veicolo = await creaVeicolo(cliente.id);
      await creaScadenza(veicolo.id, { meseScadenza: 6, annoScadenza: 2026 });

      const esito = await withFrozenTime(ADESSO, () => service.generaAvvisiDovuti());

      expect(esito).toMatchObject({ avvisiCreati: 0, esclusiPerScelta: 1, senzaDestinatario: 0 });
      expect(await prisma.avviso.count()).toBe(0);
    });

    it('tratta un indirizzo non valido come recapito mancante', async () => {
      const cliente = await creaCliente({ email: 'da chiedere al cliente' });
      const veicolo = await creaVeicolo(cliente.id);
      await creaScadenza(veicolo.id, { meseScadenza: 6, annoScadenza: 2026 });

      const esito = await withFrozenTime(ADESSO, () => service.generaAvvisiDovuti());

      expect(esito).toMatchObject({ avvisiCreati: 0, senzaDestinatario: 1 });
    });

    it('elenca i clienti con scadenze imminenti ma senza recapito utilizzabile', async () => {
      const senza = await creaCliente({ ragioneSociale: 'Senza Email Srl', email: null });
      const nonValida = await creaCliente({ ragioneSociale: 'Email Errata Srl', email: 'rossi at example' });
      const escluso = await creaCliente({ email: null, avvisiEmail: false });
      const conEmail = await creaCliente({ email: 'ok@example.com' });
      for (const c of [senza, nonValida, escluso, conEmail]) {
        const v = await creaVeicolo(c.id);
        await creaScadenza(v.id, { meseScadenza: 6, annoScadenza: 2026 });
      }
      // Due scadenze per lo stesso cliente contano una volta sola come cliente.
      const v2 = await creaVeicolo(senza.id);
      await creaScadenza(v2.id, { meseScadenza: 6, annoScadenza: 2026 });

      const elenco = await withFrozenTime(ADESSO, () => service.senzaRecapito());

      expect(elenco.map((c) => [c.nome, c.scadenze])).toEqual([
        ['Email Errata Srl', 1],
        ['Senza Email Srl', 2],
      ]);
      expect(elenco.find((c) => c.idCliente === nonValida.id).email).toBe('rossi at example');
    });
  });

  describe('gestione manuale', () => {
    async function avvisoCon(esito: 'DA_INVIARE' | 'ERRORE' | 'ANNULLATO' | 'INVIATO', canale: 'EMAIL' | 'ARCHIVIO' = 'EMAIL') {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      const scadenza = await creaScadenza(veicolo.id);
      return prisma.avviso.create({
        data: {
          idScadenza: scadenza.id,
          tipo: 'PRIMO',
          canale,
          esito,
          tentativi: esito === 'ERRORE' ? 3 : 0,
          errore: esito === 'ERRORE' ? '550 User unknown' : null,
          dataInvio: esito === 'INVIATO' ? new Date(Date.UTC(2026, 5, 1)) : null,
        },
      });
    }

    it('rimette in coda un avviso in errore azzerando i tentativi, e lo registra', async () => {
      const avviso = await avvisoCon('ERRORE');

      const esito = await service.rimettiInCoda([avviso.id], 'operatore@studio.it');

      expect(esito.rimessi).toBe(1);
      expect(await prisma.avviso.findUnique({ where: { id: avviso.id } })).toMatchObject({
        esito: 'DA_INVIARE',
        tentativi: 0,
        errore: null,
        prossimoTentativo: null,
      });
      const voce = await prisma.auditLog.findFirst({ where: { entita: 'avviso' } });
      expect(voce).toMatchObject({ idEntita: avviso.id, utente: 'operatore@studio.it' });
      expect(voce.datiPrima).toMatchObject({ esito: 'ERRORE', errore: '550 User unknown' });
    });

    it('rimettendo in coda un avviso annullato ne cancella la nota', async () => {
      const avviso = await avvisoCon('ANNULLATO');
      await prisma.avviso.update({ where: { id: avviso.id }, data: { note: 'Annullato manualmente da x' } });

      await service.rimettiInCoda([avviso.id]);

      expect(await prisma.avviso.findUnique({ where: { id: avviso.id } })).toMatchObject({
        esito: 'DA_INVIARE',
        note: null,
      });
      const voce = await prisma.auditLog.findFirst({ where: { entita: 'avviso' } });
      expect(voce.datiPrima).toMatchObject({ note: 'Annullato manualmente da x' });
    });

    it('non rimette in coda avvisi inviati o recuperati dall\'archivio', async () => {
      const inviato = await avvisoCon('INVIATO');
      const archivio = await avvisoCon('ANNULLATO', 'ARCHIVIO');

      const esito = await service.rimettiInCoda([inviato.id, archivio.id]);

      expect(esito.rimessi).toBe(0);
      expect((await prisma.avviso.findUnique({ where: { id: inviato.id } })).esito).toBe('INVIATO');
    });

    it('annulla un avviso in coda indicando chi l\'ha annullato', async () => {
      const avviso = await avvisoCon('DA_INVIARE');

      const annullato = await service.annulla(avviso.id, 'admin@studio.it');

      expect(annullato.esito).toBe('ANNULLATO');
      expect(annullato.note).toBe('Annullato manualmente da admin@studio.it');
      expect(await prisma.auditLog.count({ where: { entita: 'avviso', idEntita: avviso.id } })).toBe(1);
    });

    it('non annulla un avviso già inviato', async () => {
      const avviso = await avvisoCon('INVIATO');
      await expect(service.annulla(avviso.id)).rejects.toThrow(/solo avvisi in coda o in errore/);
    });

    it('conta gli avvisi via email per esito', async () => {
      await avvisoCon('DA_INVIARE');
      await avvisoCon('ERRORE');
      await avvisoCon('ERRORE');
      await avvisoCon('INVIATO', 'ARCHIVIO');

      const conteggi = await service.conteggi();

      expect(conteggi).toMatchObject({ daInviare: 1, errori: 2, inviati: 0, annullati: 0, inInvio: 0 });
    });

    it('elenca gli avvisi per esito con scadenza, veicolo e cliente', async () => {
      const avviso = await avvisoCon('ERRORE');

      const elenco = await service.elenco('ERRORE');

      expect(elenco).toHaveLength(1);
      expect(elenco[0].id).toBe(avviso.id);
      expect(elenco[0].scadenza.veicolo.cliente.ragioneSociale).toBe('Trasporti Test Srl');
    });
  });
});
