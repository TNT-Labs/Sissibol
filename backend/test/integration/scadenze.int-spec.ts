/**
 * Test di integrazione dello ScadenzeService su PostgreSQL reale.
 *
 * Coprono i comportamenti che un mock di Prisma non può verificare:
 * filtri annidati su cliente/veicolo attivi, updateMany con OR su mese/anno,
 * generazione massiva delle scadenze future e calcolo automatico dell'importo.
 *
 * Come il golden master, fissano il comportamento ATTUALE: dove il servizio
 * oggi si comporta in modo discutibile, il test lo annota senza correggerlo.
 */

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

/** Istante di riferimento dei test: giugno 2026, a metà mese. */
const ADESSO = '2026-06-15T12:00:00.000Z';

describe('ScadenzeService (integrazione)', () => {
  let service: ScadenzeService;
  let prisma: ReturnType<typeof getPrisma>;

  beforeAll(() => {
    prisma = getPrisma();
    const audit = new AuditService(prisma as never);
    const bollo = new BolloService(prisma as never, audit);
    service = new ScadenzeService(prisma as never, bollo, audit);
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedTariffario();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  // =====================================================
  // CREAZIONE E CALCOLO AUTOMATICO DELL'IMPORTO
  // =====================================================

  describe('create', () => {
    it('calcola l\'importo dal tariffario quando non è indicato', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id, {
        tipoVeicolo: 'Autovettura',
        classeAmbientale: 'Euro 6',
        potenzaKw: '100',
      });

      const scadenza = await service.create({
        idVeicolo: veicolo.id,
        meseScadenza: 6,
        annoScadenza: 2026,
        periodicita: 'ANNUALE',
      } as never);

      // 100 KW x 2.58 = 258.00
      expect(Number(scadenza.importoPrevisto)).toBe(258);
    });

    it('rispetta l\'importo indicato senza ricalcolarlo', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);

      const scadenza = await service.create({
        idVeicolo: veicolo.id,
        meseScadenza: 6,
        annoScadenza: 2026,
        periodicita: 'ANNUALE',
        importoPrevisto: 999.99,
      } as never);

      expect(Number(scadenza.importoPrevisto)).toBe(999.99);
    });

    it('crea comunque la scadenza se il calcolo non è possibile', async () => {
      // Regione senza tariffario: oggi l'importo resta nullo e la scadenza
      // viene creata lo stesso, senza che nulla lo segnali all'utente.
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id, { regione: 'Veneto' });

      const scadenza = await service.create({
        idVeicolo: veicolo.id,
        meseScadenza: 6,
        annoScadenza: 2026,
        periodicita: 'ANNUALE',
      } as never);

      expect(scadenza.importoPrevisto).toBeNull();
    });

    it('rifiuta un mese fuori dall\'intervallo 1-12', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);

      await expect(
        service.create({
          idVeicolo: veicolo.id,
          meseScadenza: 13,
          annoScadenza: 2026,
          periodicita: 'ANNUALE',
        } as never),
      ).rejects.toThrow('Il mese deve essere compreso tra 1 e 12');
    });
  });

  // =====================================================
  // FILTRI: SOLO CLIENTI E VEICOLI ATTIVI
  // =====================================================

  describe('findAll', () => {
    it('esclude le scadenze dei clienti disattivati', async () => {
      const attivo = await creaCliente({ ragioneSociale: 'Attivo Srl' });
      const disattivo = await creaCliente({
        ragioneSociale: 'Cessato Srl',
        attivo: false,
      });

      const v1 = await creaVeicolo(attivo.id, { targa: 'AA111AA' });
      const v2 = await creaVeicolo(disattivo.id, { targa: 'BB222BB' });
      await creaScadenza(v1.id);
      await creaScadenza(v2.id);

      const risultato = await service.findAll();

      expect(risultato).toHaveLength(1);
      expect(risultato[0].veicolo.targa).toBe('AA111AA');
    });

    it('esclude le scadenze dei veicoli disattivati', async () => {
      const cliente = await creaCliente();
      const attivo = await creaVeicolo(cliente.id, { targa: 'AA111AA' });
      const dismesso = await creaVeicolo(cliente.id, {
        targa: 'BB222BB',
        attivo: false,
      });
      await creaScadenza(attivo.id);
      await creaScadenza(dismesso.id);

      const risultato = await service.findAll();

      expect(risultato).toHaveLength(1);
      expect(risultato[0].veicolo.targa).toBe('AA111AA');
    });

    it('filtra per stato, cliente, mese e anno', async () => {
      const cliente = await creaCliente();
      const altro = await creaCliente({ ragioneSociale: 'Altro Srl' });
      const v1 = await creaVeicolo(cliente.id, { targa: 'AA111AA' });
      const v2 = await creaVeicolo(altro.id, { targa: 'BB222BB' });

      await creaScadenza(v1.id, { meseScadenza: 3, annoScadenza: 2026, stato: 'DA_PAGARE' });
      await creaScadenza(v1.id, { meseScadenza: 3, annoScadenza: 2026, stato: 'PAGATO' });
      await creaScadenza(v1.id, { meseScadenza: 4, annoScadenza: 2026, stato: 'DA_PAGARE' });
      await creaScadenza(v2.id, { meseScadenza: 3, annoScadenza: 2026, stato: 'DA_PAGARE' });

      expect(await service.findAll('DA_PAGARE' as never)).toHaveLength(3);
      expect(await service.findAll(undefined, cliente.id)).toHaveLength(3);
      expect(await service.findAll(undefined, undefined, 3, 2026)).toHaveLength(3);
      expect(
        await service.findAll('DA_PAGARE' as never, cliente.id, 3, 2026),
      ).toHaveLength(1);
    });
  });

  describe('findAllPaginated', () => {
    it('pagina i risultati e riporta il totale', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      for (let mese = 1; mese <= 12; mese++) {
        await creaScadenza(veicolo.id, { meseScadenza: mese, annoScadenza: 2026 });
      }

      const pagina1 = await service.findAllPaginated({ page: 1, pageSize: 5 });
      const pagina3 = await service.findAllPaginated({ page: 3, pageSize: 5 });

      expect(pagina1.data).toHaveLength(5);
      expect(pagina1.pagination.totalCount).toBe(12);
      expect(pagina3.data).toHaveLength(2);
    });

    it('filtra per intervallo di anni', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      await creaScadenza(veicolo.id, { annoScadenza: 2024 });
      await creaScadenza(veicolo.id, { annoScadenza: 2025 });
      await creaScadenza(veicolo.id, { annoScadenza: 2026 });

      const risultato = await service.findAllPaginated({
        page: 1,
        pageSize: 50,
        annoFrom: 2025,
        annoTo: 2026,
      });

      expect(risultato.pagination.totalCount).toBe(2);
    });
  });

  describe('getStatsCounts', () => {
    it('conta le scadenze per stato', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      await creaScadenza(veicolo.id, { meseScadenza: 1, stato: 'DA_PAGARE' });
      await creaScadenza(veicolo.id, { meseScadenza: 2, stato: 'DA_PAGARE' });
      await creaScadenza(veicolo.id, { meseScadenza: 3, stato: 'PAGATO' });
      await creaScadenza(veicolo.id, { meseScadenza: 4, stato: 'SCADUTO' });

      const stats = await service.getStatsCounts();

      expect(stats.daPagare).toBe(2);
      expect(stats.totale).toBe(4);
      expect(stats.pagato).toBe(1);
      expect(stats.scaduto).toBe(1);
    });
  });

  // =====================================================
  // AGGIORNAMENTO AUTOMATICO DEGLI SCADUTI
  // =====================================================

  describe('updateScaduteAutomaticamente', () => {
    it('marca SCADUTE le DA_PAGARE con mese o anno passato', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);

      const annoPassato = await creaScadenza(veicolo.id, {
        meseScadenza: 12,
        annoScadenza: 2025,
      });
      const mesePassato = await creaScadenza(veicolo.id, {
        meseScadenza: 5,
        annoScadenza: 2026,
      });
      const meseCorrente = await creaScadenza(veicolo.id, {
        meseScadenza: 6,
        annoScadenza: 2026,
      });
      const futura = await creaScadenza(veicolo.id, {
        meseScadenza: 9,
        annoScadenza: 2026,
      });

      const aggiornate = await withFrozenTime(ADESSO, () =>
        service.updateScaduteAutomaticamente(),
      );

      expect(aggiornate).toBe(2);
      const stati = await prisma.scadenza.findMany({
        where: { id: { in: [annoPassato.id, mesePassato.id, meseCorrente.id, futura.id] } },
        orderBy: { id: 'asc' },
        select: { stato: true },
      });
      expect(stati.map((s) => s.stato)).toEqual([
        'SCADUTO',
        'SCADUTO',
        'DA_PAGARE', // il mese corrente non è ancora scaduto
        'DA_PAGARE',
      ]);
    });

    it('non tocca le scadenze già PAGATE', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      const pagata = await creaScadenza(veicolo.id, {
        meseScadenza: 1,
        annoScadenza: 2020,
        stato: 'PAGATO',
      });

      await withFrozenTime(ADESSO, () => service.updateScaduteAutomaticamente());

      const dopo = await prisma.scadenza.findUnique({ where: { id: pagata.id } });
      expect(dopo.stato).toBe('PAGATO');
    });

    it('aggiorna anche le scadenze di clienti disattivati', async () => {
      // Comportamento attuale: updateMany non filtra su cliente/veicolo attivo,
      // a differenza di findAll. Annotato perché è un'incoerenza fra i due
      // percorsi, non perché sia il comportamento desiderato.
      const cliente = await creaCliente({ attivo: false });
      const veicolo = await creaVeicolo(cliente.id, { attivo: false });
      const scadenza = await creaScadenza(veicolo.id, {
        meseScadenza: 1,
        annoScadenza: 2020,
      });

      await withFrozenTime(ADESSO, () => service.updateScaduteAutomaticamente());

      const dopo = await prisma.scadenza.findUnique({ where: { id: scadenza.id } });
      expect(dopo.stato).toBe('SCADUTO');
    });
  });

  // =====================================================
  // SCADENZE IMMINENTI (BASE DELLE NOTIFICHE)
  // =====================================================

  describe('getScadenzeInScadenza', () => {
    it('restituisce solo le scadenze entro i giorni di anticipo', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);

      await creaScadenza(veicolo.id, { meseScadenza: 6, annoScadenza: 2026 }); // 30 giugno
      await creaScadenza(veicolo.id, { meseScadenza: 7, annoScadenza: 2026 }); // 31 luglio
      await creaScadenza(veicolo.id, { meseScadenza: 12, annoScadenza: 2026 });

      const imminenti = await withFrozenTime(ADESSO, () =>
        service.getScadenzeInScadenza(30),
      );

      // Dal 15 giugno, entro 30 giorni cade solo la scadenza di fine giugno.
      expect(imminenti).toHaveLength(1);
      expect(imminenti[0].meseScadenza).toBe(6);
    });

    it('esclude le scadenze dei clienti disattivati', async () => {
      const cliente = await creaCliente({ attivo: false });
      const veicolo = await creaVeicolo(cliente.id);
      await creaScadenza(veicolo.id, { meseScadenza: 6, annoScadenza: 2026 });

      const imminenti = await withFrozenTime(ADESSO, () =>
        service.getScadenzeInScadenza(30),
      );

      expect(imminenti).toHaveLength(0);
    });

    it('esclude le scadenze già pagate', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      await creaScadenza(veicolo.id, {
        meseScadenza: 6,
        annoScadenza: 2026,
        stato: 'PAGATO',
      });

      const imminenti = await withFrozenTime(ADESSO, () =>
        service.getScadenzeInScadenza(30),
      );

      expect(imminenti).toHaveLength(0);
    });
  });

  // =====================================================
  // GENERAZIONE SCADENZE FUTURE
  // =====================================================

  describe('generaScadenzeFuture', () => {
    it('crea le scadenze annuali nel mese di immatricolazione', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id, {
        dataImmatricolazione: new Date('2010-03-31'),
      });

      const esito = await withFrozenTime(ADESSO, () =>
        service.generaScadenzeFuture(2027),
      );

      expect(esito.veicoliProcessati).toBe(1);
      expect(esito.scadenzeCreate).toBeGreaterThan(0);

      const create = await prisma.scadenza.findMany({
        where: { idVeicolo: veicolo.id },
      });
      expect(create.every((s) => s.meseScadenza === 3)).toBe(true);
    });

    it('non duplica le scadenze già presenti', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id, {
        dataImmatricolazione: new Date('2010-03-31'),
      });

      await withFrozenTime(ADESSO, () => service.generaScadenzeFuture(2027));
      const dopoPrima = await prisma.scadenza.count();

      const secondo = await withFrozenTime(ADESSO, () =>
        service.generaScadenzeFuture(2027),
      );
      const dopoSeconda = await prisma.scadenza.count();

      expect(dopoSeconda).toBe(dopoPrima);
      expect(secondo.scadenzeCreate).toBe(0);
      expect(secondo.scadenzeSaltate).toBeGreaterThan(0);
    });

    it('genera tre scadenze l\'anno per i veicoli quadrimestrali', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id, {
        dataImmatricolazione: new Date('2010-03-31'),
      });
      // La periodicità è ereditata dalla scadenza più recente del veicolo.
      await creaScadenza(veicolo.id, {
        meseScadenza: 3,
        annoScadenza: 2026,
        periodicita: 'QUADRIMESTRALE',
      });

      await withFrozenTime(ADESSO, () => service.generaScadenzeFuture(2027));

      const del2027 = await prisma.scadenza.findMany({
        where: { idVeicolo: veicolo.id, annoScadenza: 2027 },
        orderBy: { meseScadenza: 'asc' },
      });

      // Marzo, luglio, novembre
      expect(del2027.map((s) => s.meseScadenza)).toEqual([3, 7, 11]);
      expect(del2027.every((s) => s.periodicita === 'QUADRIMESTRALE')).toBe(true);
    });

    it('ignora i veicoli di clienti disattivati', async () => {
      const cliente = await creaCliente({ attivo: false });
      await creaVeicolo(cliente.id, {
        dataImmatricolazione: new Date('2010-03-31'),
      });

      const esito = await withFrozenTime(ADESSO, () =>
        service.generaScadenzeFuture(2027),
      );

      expect(esito.veicoliProcessati).toBe(0);
    });

    it('rifiuta un anno target nel passato o troppo lontano', async () => {
      await expect(
        withFrozenTime(ADESSO, () => service.generaScadenzeFuture(2025)),
      ).rejects.toThrow();

      await expect(
        withFrozenTime(ADESSO, () => service.generaScadenzeFuture(2050)),
      ).rejects.toThrow();
    });
  });

  // =====================================================
  // RICALCOLO
  // =====================================================

  describe('ricalcolaImporto', () => {
    it('riallinea l\'importo al tariffario corrente', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id, { potenzaKw: '100' });
      const scadenza = await creaScadenza(veicolo.id, {
        importoPrevisto: '1',
        annoScadenza: 2026,
      });

      const aggiornata = await service.ricalcolaImporto(scadenza.id);

      expect(Number(aggiornata.importoPrevisto)).toBe(258);
    });

    it('segnala l\'errore se il tariffario non copre la regione', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id, { regione: 'Veneto' });
      const scadenza = await creaScadenza(veicolo.id);

      await expect(service.ricalcolaImporto(scadenza.id)).rejects.toThrow(
        /Impossibile ricalcolare/,
      );
    });
  });

  // =====================================================
  // CANCELLAZIONE A CASCATA
  // =====================================================

  describe('integrità referenziale', () => {
    it('elimina le scadenze quando si elimina il veicolo', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      await creaScadenza(veicolo.id);

      await prisma.veicolo.delete({ where: { id: veicolo.id } });

      expect(await prisma.scadenza.count()).toBe(0);
    });

    it('elimina veicoli e scadenze quando si elimina il cliente', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      await creaScadenza(veicolo.id);

      await prisma.cliente.delete({ where: { id: cliente.id } });

      expect(await prisma.veicolo.count()).toBe(0);
      expect(await prisma.scadenza.count()).toBe(0);
    });
  });
});
