/**
 * Test di integrazione del PagamentiService su PostgreSQL reale.
 *
 * È il percorso più delicato del sistema: registrare un pagamento deve, in
 * un'unica transazione, creare il pagamento, congelare lo snapshot delle
 * tariffe applicate e portare la scadenza a PAGATO. Lo snapshot è ciò che
 * rende difendibile un importo anni dopo, quando il tariffario è cambiato.
 *
 * Coperti anche il locking ottimistico e il pagamento multiplo per cliente.
 */

import { PagamentiService } from '../../src/pagamenti/pagamenti.service';
import { BolloService } from '../../src/bollo/bollo.service';
import {
  creaCliente,
  creaScadenza,
  creaVeicolo,
  disconnectPrisma,
  getPrisma,
  resetDatabase,
  seedTariffario,
} from './setup/test-db';

describe('PagamentiService (integrazione)', () => {
  let service: PagamentiService;
  let prisma: ReturnType<typeof getPrisma>;

  beforeAll(() => {
    prisma = getPrisma();
    const bollo = new BolloService(prisma as never);
    service = new PagamentiService(prisma as never, bollo);
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedTariffario();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  // =====================================================
  // REGISTRAZIONE DEL PAGAMENTO
  // =====================================================

  describe('create', () => {
    it('registra il pagamento e porta la scadenza a PAGATO', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      const scadenza = await creaScadenza(veicolo.id);

      const pagamento = await service.create({
        idScadenza: scadenza.id,
        dataPagamento: '2026-06-20',
        importoPagato: 258,
        metodoPagamento: 'Bonifico',
      } as never);

      expect(Number(pagamento.importoPagato)).toBe(258);

      const dopo = await prisma.scadenza.findUnique({ where: { id: scadenza.id } });
      expect(dopo.stato).toBe('PAGATO');
    });

    it('congela lo snapshot delle tariffe applicate', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id, {
        targa: 'AA111AA',
        potenzaKw: '100',
        classeAmbientale: 'Euro 6',
      });
      const scadenza = await creaScadenza(veicolo.id);

      const pagamento = await service.create({
        idScadenza: scadenza.id,
        dataPagamento: '2026-06-20',
        importoPagato: 258,
      } as never);

      const snapshot = await prisma.snapshotCalcoloBollo.findUnique({
        where: { idPagamento: pagamento.id },
      });

      expect(snapshot).not.toBeNull();
      expect(Number(snapshot.importoBase)).toBe(258);
      expect(Number(snapshot.scontoRidApplicato)).toBe(15);
      expect(snapshot.regioneConfigurazione).toBe('Lombardia');
      expect(snapshot.annoConfigurazione).toBe(2026);
      expect(snapshot.veicoloSnapshot).toMatchObject({
        targa: 'AA111AA',
        potenzaKw: 100,
        classeAmbientale: 'Euro 6',
      });
    });

    it('lo snapshot non cambia se poi cambiano le tariffe', async () => {
      // È la ragione d'essere dello snapshot: un report storico deve restare
      // quello di allora anche dopo un aggiornamento del tariffario.
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id, { potenzaKw: '100' });
      const scadenza = await creaScadenza(veicolo.id);

      const pagamento = await service.create({
        idScadenza: scadenza.id,
        dataPagamento: '2026-06-20',
        importoPagato: 258,
      } as never);

      // Raddoppia la tariffa base delle autovetture Euro 4-5-6
      await prisma.tariffaBollo.updateMany({
        where: { tipoVeicolo: 'Autovettura', categoriaEuro: 'Euro 4-5-6' },
        data: { importoUnitario: '5.16' },
      });

      const snapshot = await prisma.snapshotCalcoloBollo.findUnique({
        where: { idPagamento: pagamento.id },
      });
      expect(Number(snapshot.importoBase)).toBe(258);
    });

    it('registra il pagamento anche senza snapshot se il calcolo fallisce', async () => {
      // Comportamento attuale: regione senza tariffario -> pagamento senza
      // snapshot, quindi senza tracciabilità dell'importo. Annotato perché è
      // proprio il caso in cui la tracciabilità servirebbe di più.
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id, { regione: 'Veneto' });
      const scadenza = await creaScadenza(veicolo.id);

      const pagamento = await service.create({
        idScadenza: scadenza.id,
        dataPagamento: '2026-06-20',
        importoPagato: 300,
      } as never);

      const snapshot = await prisma.snapshotCalcoloBollo.findUnique({
        where: { idPagamento: pagamento.id },
      });
      expect(snapshot).toBeNull();
      expect(Number(pagamento.importoPagato)).toBe(300);
    });

    it('rifiuta un pagamento su una scadenza inesistente', async () => {
      await expect(
        service.create({
          idScadenza: 999999,
          dataPagamento: '2026-06-20',
          importoPagato: 100,
        } as never),
      ).rejects.toThrow(/non trovata/);
    });
  });

  // =====================================================
  // LOCKING OTTIMISTICO
  // =====================================================

  describe('update con controllo di versione', () => {
    it('accetta la modifica se la versione coincide', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      const scadenza = await creaScadenza(veicolo.id);
      const pagamento = await service.create({
        idScadenza: scadenza.id,
        dataPagamento: '2026-06-20',
        importoPagato: 258,
      } as never);

      const aggiornato = await service.update(pagamento.id, {
        version: pagamento.version,
        importoPagato: 260,
      } as never);

      expect(Number(aggiornato.importoPagato)).toBe(260);
      expect(aggiornato.version).toBe(pagamento.version + 1);
    });

    it('rifiuta la seconda modifica concorrente sulla stessa versione', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      const scadenza = await creaScadenza(veicolo.id);
      const pagamento = await service.create({
        idScadenza: scadenza.id,
        dataPagamento: '2026-06-20',
        importoPagato: 258,
      } as never);

      // Primo operatore: passa
      await service.update(pagamento.id, {
        version: pagamento.version,
        importoPagato: 260,
      } as never);

      // Secondo operatore, partito dalla stessa schermata: deve essere respinto
      await expect(
        service.update(pagamento.id, {
          version: pagamento.version,
          importoPagato: 270,
        } as never),
      ).rejects.toThrow(/modificato da un altro utente/);

      const finale = await prisma.pagamento.findUnique({ where: { id: pagamento.id } });
      expect(Number(finale.importoPagato)).toBe(260);
    });

    it('accetta la modifica senza versione, senza protezione', async () => {
      // Comportamento attuale: il controllo scatta solo se il client manda
      // `version`. Un client che la omette scavalca il locking.
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      const scadenza = await creaScadenza(veicolo.id);
      const pagamento = await service.create({
        idScadenza: scadenza.id,
        dataPagamento: '2026-06-20',
        importoPagato: 258,
      } as never);

      const aggiornato = await service.update(pagamento.id, {
        importoPagato: 999,
      } as never);

      expect(Number(aggiornato.importoPagato)).toBe(999);
    });
  });

  // =====================================================
  // ELIMINAZIONE
  // =====================================================

  describe('remove', () => {
    it('riporta la scadenza a DA_PAGARE ed elimina lo snapshot', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      const scadenza = await creaScadenza(veicolo.id);
      const pagamento = await service.create({
        idScadenza: scadenza.id,
        dataPagamento: '2026-06-20',
        importoPagato: 258,
      } as never);

      await service.remove(pagamento.id);

      const dopo = await prisma.scadenza.findUnique({ where: { id: scadenza.id } });
      expect(dopo.stato).toBe('DA_PAGARE');
      expect(await prisma.snapshotCalcoloBollo.count()).toBe(0);
    });
  });

  // =====================================================
  // PAGAMENTO MULTIPLO PER CLIENTE
  // =====================================================

  describe('createMultiplo', () => {
    it('paga tutte le scadenze del cliente nel periodo', async () => {
      const cliente = await creaCliente();
      const v1 = await creaVeicolo(cliente.id, { targa: 'AA111AA' });
      const v2 = await creaVeicolo(cliente.id, { targa: 'BB222BB' });
      await creaScadenza(v1.id, { meseScadenza: 6, annoScadenza: 2026 });
      await creaScadenza(v2.id, { meseScadenza: 6, annoScadenza: 2026 });

      const esito = await service.createMultiplo({
        idCliente: cliente.id,
        meseScadenza: 6,
        annoScadenza: 2026,
        dataPagamento: '2026-06-20',
        metodoPagamento: 'RID',
      });

      expect(esito.pagamentiCreati).toBe(2);
      expect(esito.errori).toHaveLength(0);
      expect(
        await prisma.scadenza.count({ where: { stato: 'PAGATO' } }),
      ).toBe(2);
    });

    it('salta le scadenze senza importo e le segnala', async () => {
      // Registrare un pagamento su un importo mancante falserebbe i report:
      // la scadenza resta da pagare e finisce fra gli errori.
      const cliente = await creaCliente();
      const v1 = await creaVeicolo(cliente.id, { targa: 'AA111AA' });
      const v2 = await creaVeicolo(cliente.id, { targa: 'BB222BB' });
      await creaScadenza(v1.id, { meseScadenza: 6, annoScadenza: 2026 });
      await creaScadenza(v2.id, {
        meseScadenza: 6,
        annoScadenza: 2026,
        importoPrevisto: null,
      });

      const esito = await service.createMultiplo({
        idCliente: cliente.id,
        meseScadenza: 6,
        annoScadenza: 2026,
        dataPagamento: '2026-06-20',
      });

      expect(esito.pagamentiCreati).toBe(1);
      expect(esito.errori).toHaveLength(1);
      expect(esito.errori[0]).toContain('BB222BB');
      expect(
        await prisma.scadenza.count({ where: { stato: 'DA_PAGARE' } }),
      ).toBe(1);
    });

    it('non tocca le scadenze di altri clienti o di altri periodi', async () => {
      const cliente = await creaCliente();
      const altro = await creaCliente({ ragioneSociale: 'Altro Srl' });
      const v1 = await creaVeicolo(cliente.id, { targa: 'AA111AA' });
      const v2 = await creaVeicolo(altro.id, { targa: 'BB222BB' });

      await creaScadenza(v1.id, { meseScadenza: 6, annoScadenza: 2026 });
      await creaScadenza(v1.id, { meseScadenza: 7, annoScadenza: 2026 });
      await creaScadenza(v2.id, { meseScadenza: 6, annoScadenza: 2026 });

      const esito = await service.createMultiplo({
        idCliente: cliente.id,
        meseScadenza: 6,
        annoScadenza: 2026,
        dataPagamento: '2026-06-20',
      });

      expect(esito.pagamentiCreati).toBe(1);
      expect(
        await prisma.scadenza.count({ where: { stato: 'DA_PAGARE' } }),
      ).toBe(2);
    });

    it('riporta zero pagamenti se non c\'è nulla da pagare', async () => {
      const cliente = await creaCliente();

      const esito = await service.createMultiplo({
        idCliente: cliente.id,
        meseScadenza: 6,
        annoScadenza: 2026,
        dataPagamento: '2026-06-20',
      });

      expect(esito.pagamentiCreati).toBe(0);
    });
  });
});
