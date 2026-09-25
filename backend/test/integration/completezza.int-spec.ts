/**
 * Test di integrazione della bonifica dei dati dei veicoli.
 *
 * Verificano il rapporto di completezza e ciò che accade quando i dati
 * vengono completati: il calcolo diventa possibile, le scadenze senza importo
 * lo ricevono, quelle che ne avevano uno restano come sono, e ogni modifica
 * dei dati di calcolo finisce nel registro.
 */

import { AuditService } from '../../src/audit/audit.service';
import { BolloService } from '../../src/bollo/bollo.service';
import { CompletezzaService } from '../../src/completezza/completezza.service';
import { VeicoliService } from '../../src/veicoli/veicoli.service';
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

// Il tariffario di prova è Lombardia 2026.
const ADESSO = '2026-06-15T12:00:00.000Z';

describe('Bonifica dei dati dei veicoli (integrazione)', () => {
  const prisma = getPrisma();
  const audit = new AuditService(prisma as never);
  const bollo = new BolloService(prisma as never, audit);
  const completezza = new CompletezzaService(prisma as never, bollo);
  const veicoli = new VeicoliService(prisma as never, bollo, audit);

  const alle = <T>(fn: () => Promise<T>) => withFrozenTime(ADESSO, fn);

  beforeEach(async () => {
    await resetDatabase();
    await seedTariffario();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  /** Veicolo importato dall'archivio: solo targa e regione. */
  async function veicoloIncompleto(idCliente: number, targa: string) {
    const v = await creaVeicolo(idCliente, { targa });
    return prisma.veicolo.update({
      where: { id: v.id },
      data: { tipoVeicolo: null, potenzaKw: null, classeAmbientale: null, alimentazione: null },
    });
  }

  describe('rapporto di completezza', () => {
    it('conta i veicoli calcolabili ed elenca cosa manca agli altri', async () => {
      const cliente = await creaCliente({ ragioneSociale: 'Alfa Trasporti' });
      await creaVeicolo(cliente.id, { targa: 'OK111OK' });
      await veicoloIncompleto(cliente.id, 'KO222KO');

      const { rapporto, righe, totaleRighe } = await alle(() => completezza.elenco());

      expect(rapporto).toMatchObject({ totale: 2, calcolabili: 1, nonCalcolabili: 1 });
      expect(rapporto.perCampo).toEqual([
        expect.objectContaining({ chiave: 'tipoVeicolo', veicoli: 1, doveTrovarlo: expect.stringMatching(/riquadro J/) }),
      ]);
      // Di default la lista di lavoro contiene solo i non calcolabili.
      expect(totaleRighe).toBe(1);
      expect(righe[0]).toMatchObject({
        targa: 'KO222KO',
        cliente: 'Alfa Trasporti',
        esito: 'NON_CALCOLABILE',
        importo: null,
        mancanti: [expect.objectContaining({ campo: 'tipoVeicolo', motivo: 'MANCANTE' })],
      });
      expect(righe[0].valori).toMatchObject({ tipoVeicolo: null, regione: 'Lombardia' });
    });

    it('esclude veicoli e clienti disattivati', async () => {
      const attivo = await creaCliente();
      const disattivato = await creaCliente({ attivo: false });
      await veicoloIncompleto(attivo.id, 'AA000AA');
      await veicoloIncompleto(disattivato.id, 'BB000BB');
      const spento = await veicoloIncompleto(attivo.id, 'CC000CC');
      await prisma.veicolo.update({ where: { id: spento.id }, data: { attivo: false } });

      const { rapporto } = await alle(() => completezza.elenco());

      expect(rapporto.totale).toBe(1);
    });

    it('filtra per campo mancante, ricerca, periodicità, stato e pagina', async () => {
      const cliente = await creaCliente({ ragioneSociale: 'Beta Logistica' });
      await creaVeicolo(cliente.id, { targa: 'OK111OK' });
      const quadrimestrale = await veicoloIncompleto(cliente.id, 'QQ111QQ');
      await creaScadenza(quadrimestrale.id, { periodicita: 'QUADRIMESTRALE' });
      const senzaPotenza = await creaVeicolo(cliente.id, { targa: 'PP111PP' });
      await prisma.veicolo.update({ where: { id: senzaPotenza.id }, data: { potenzaKw: null } });

      const targhe = async (filtri: Parameters<CompletezzaService['elenco']>[0]) =>
        (await alle(() => completezza.elenco(filtri))).righe.map((r) => r.targa);

      expect(await targhe({ campo: 'potenzaKw' })).toEqual(['PP111PP']);
      expect(await targhe({ cerca: 'qq1' })).toEqual(['QQ111QQ']);
      expect(await targhe({ cerca: 'beta' })).toEqual(['PP111PP', 'QQ111QQ']);
      expect(await targhe({ periodicita: 'QUADRIMESTRALE' })).toEqual(['QQ111QQ']);
      expect(await targhe({ stato: 'TUTTI' })).toEqual(['OK111OK', 'PP111PP', 'QQ111QQ']);

      const pagina2 = await alle(() => completezza.elenco({ stato: 'TUTTI', perPagina: 2, pagina: 2 }));
      expect(pagina2).toMatchObject({ pagina: 2, pagine: 2, totaleRighe: 3 });
      expect(pagina2.righe.map((r) => r.targa)).toEqual(['QQ111QQ']);
    });

    it('conta le scadenze senza importo solo negli anni con un tariffario', async () => {
      const cliente = await creaCliente();
      const v = await veicoloIncompleto(cliente.id, 'KO222KO');
      await creaScadenza(v.id, { annoScadenza: 2026, importoPrevisto: null });
      await creaScadenza(v.id, { annoScadenza: 2027, importoPrevisto: null });
      await creaScadenza(v.id, { annoScadenza: 2026, meseScadenza: 11, importoPrevisto: '100' });

      const { rapporto, righe } = await alle(() => completezza.elenco());

      expect(rapporto.anniConTariffario).toEqual([2026]);
      expect(rapporto.scadenzeSenzaImporto).toBe(1);
      expect(righe[0].scadenzeSenzaImporto).toBe(1);
    });

    it('valuta un singolo veicolo, anche disattivato', async () => {
      const cliente = await creaCliente();
      const v = await veicoloIncompleto(cliente.id, 'KO222KO');
      await prisma.veicolo.update({ where: { id: v.id }, data: { attivo: false } });

      const valutazione = await alle(() => completezza.veicolo(v.id));

      expect(valutazione.mancanti.map((m) => m.campo)).toEqual(['tipoVeicolo']);
      await expect(alle(() => completezza.veicolo(99999))).rejects.toThrow(/non trovato/);
    });
  });

  describe('completamento dei dati', () => {
    it('rende il bollo calcolabile e completa solo gli importi mancanti', async () => {
      const cliente = await creaCliente();
      const v = await veicoloIncompleto(cliente.id, 'KO222KO');
      const senzaImporto = await creaScadenza(v.id, { annoScadenza: 2026, importoPrevisto: null });
      const conImporto = await creaScadenza(v.id, { annoScadenza: 2026, meseScadenza: 11, importoPrevisto: '999' });

      const risultato = await alle(() =>
        veicoli.update(
          v.id,
          { tipoVeicolo: 'Autovettura', potenzaKw: 100, classeAmbientale: 'Euro 6' },
          'operatore@studio.it',
        ),
      );

      expect(risultato.importiCompletati).toBe(1);
      const dopo = await prisma.scadenza.findUnique({ where: { id: senzaImporto.id } });
      expect(Number(dopo.importoPrevisto)).toBeGreaterThan(0);
      // L'importo già presente (archivio o inserito a mano) non si tocca.
      expect((await prisma.scadenza.findUnique({ where: { id: conImporto.id } })).importoPrevisto.toString()).toBe('999');
      expect((await alle(() => completezza.veicolo(v.id))).esito).toBe('CALCOLATO');
    });

    it('registra quali dati di calcolo sono cambiati, da cosa a cosa e chi li ha cambiati', async () => {
      const cliente = await creaCliente();
      const v = await veicoloIncompleto(cliente.id, 'KO222KO');

      await alle(() =>
        veicoli.update(v.id, { tipoVeicolo: 'Autovettura', potenzaKw: 100, note: 'da carta' }, 'op@studio.it'),
      );

      const voce = await prisma.auditLog.findFirst({ where: { entita: 'veicolo', idEntita: v.id } });
      expect(voce).toMatchObject({ utente: 'op@studio.it', azione: 'MODIFICA' });
      expect(voce.datiPrima).toEqual({ tipoVeicolo: null, potenzaKw: null });
      expect(voce.datiDopo).toEqual({ tipoVeicolo: 'Autovettura', potenzaKw: '100' });
    });

    it('non registra nulla e non ricalcola se cambiano solo dati estranei al calcolo', async () => {
      const cliente = await creaCliente();
      const v = await veicoloIncompleto(cliente.id, 'KO222KO');

      const risultato = await alle(() => veicoli.update(v.id, { note: 'solo una nota' }));

      expect(risultato.importiCompletati).toBe(0);
      expect(await prisma.auditLog.count({ where: { entita: 'veicolo' } })).toBe(0);
    });

    it('lascia l\'importo mancante se il veicolo resta non calcolabile', async () => {
      const cliente = await creaCliente();
      const v = await veicoloIncompleto(cliente.id, 'KO222KO');
      const s = await creaScadenza(v.id, { annoScadenza: 2026, importoPrevisto: null });

      const risultato = await alle(() => veicoli.update(v.id, { tipoVeicolo: 'Autovettura' }));

      expect(risultato.importiCompletati).toBe(0);
      expect((await prisma.scadenza.findUnique({ where: { id: s.id } })).importoPrevisto).toBeNull();
      // Il motore ora chiede il blocco successivo di dati.
      const valutazione = await alle(() => completezza.veicolo(v.id));
      expect(valutazione.mancanti.map((m) => m.campo).sort()).toEqual(['classeAmbientale', 'potenzaKw']);
    });

    it('imposta lo stesso tipo su più veicoli insieme', async () => {
      const cliente = await creaCliente();
      const a = await veicoloIncompleto(cliente.id, 'AA000AA');
      const b = await veicoloIncompleto(cliente.id, 'BB000BB');
      for (const v of [a, b]) {
        await prisma.veicolo.update({ where: { id: v.id }, data: { potenzaKw: 90, classeAmbientale: 'Euro 5' } });
        await creaScadenza(v.id, { annoScadenza: 2026, importoPrevisto: null });
      }

      const esito = await alle(() =>
        veicoli.impostaCampo([a.id, b.id, 99999], 'tipoVeicolo', 'Autovettura', 'op@studio.it'),
      );

      expect(esito).toEqual({ aggiornati: 2, importiCompletati: 2, nonTrovati: [99999] });
      expect(await prisma.auditLog.count({ where: { entita: 'veicolo' } })).toBe(2);
      const { rapporto } = await alle(() => completezza.elenco());
      expect(rapporto.calcolabili).toBe(2);
    });
  });
});
