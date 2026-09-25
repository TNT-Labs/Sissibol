/**
 * Test di integrazione sul modello dati introdotto nella fase 1.
 *
 * Verificano che i vincoli siano davvero applicati dal database e non solo
 * rispettati dal codice applicativo: è la differenza fra un invariante e una
 * convenzione. Un client dell'API, uno script di import o una query manuale
 * devono trovare la stessa barriera.
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
  ultimoGiornoDelMese,
} from './setup/test-db';

const ADESSO = '2026-06-15T12:00:00.000Z';

describe('Modello dati (integrazione)', () => {
  let prisma: ReturnType<typeof getPrisma>;
  let scadenze: ScadenzeService;

  beforeAll(() => {
    prisma = getPrisma();
    const audit = new AuditService(prisma as never);
    const bollo = new BolloService(prisma as never, audit);
    scadenze = new ScadenzeService(prisma as never, bollo, audit);
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedTariffario();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  // =====================================================
  // DATA DI SCADENZA
  // =====================================================

  describe('data di scadenza', () => {
    it('il database rifiuta una data incoerente con mese e anno', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);

      await expect(
        prisma.scadenza.create({
          data: {
            idVeicolo: veicolo.id,
            dataScadenza: new Date(Date.UTC(2026, 5, 30)), // giugno
            meseScadenza: 7, // ...dichiarato luglio
            annoScadenza: 2026,
            periodicita: 'ANNUALE',
          },
        }),
      ).rejects.toThrow(/scadenze_data_coerente_con_mese_anno/);
    });

    it('il database rifiuta un mese fuori dall\'intervallo', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);

      await expect(
        prisma.scadenza.create({
          data: {
            idVeicolo: veicolo.id,
            dataScadenza: new Date(Date.UTC(2026, 5, 30)),
            meseScadenza: 13,
            annoScadenza: 2026,
            periodicita: 'ANNUALE',
          },
        }),
      ).rejects.toThrow();
    });

    it('il servizio valorizza la data all\'ultimo giorno del mese', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);

      const creata = await scadenze.create({
        idVeicolo: veicolo.id,
        meseScadenza: 2,
        annoScadenza: 2028, // bisestile
        periodicita: 'ANNUALE',
      } as never);

      expect(creata.dataScadenza.toISOString().slice(0, 10)).toBe('2028-02-29');
    });

    it('la modifica di mese o anno ricalcola la data', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);
      const scadenza = await creaScadenza(veicolo.id, {
        meseScadenza: 6,
        annoScadenza: 2026,
      });

      const aggiornata = await scadenze.update(scadenza.id, {
        meseScadenza: 11,
      } as never);

      expect(aggiornata.dataScadenza.toISOString().slice(0, 10)).toBe('2026-11-30');
      expect(aggiornata.meseScadenza).toBe(11);
    });

    it('la ricerca delle scadenze imminenti usa la data, non il mese', async () => {
      // Il confine dei 30 giorni non coincide con il confine del mese:
      // è il caso che la vecchia query per mese/anno sbagliava.
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);

      await creaScadenza(veicolo.id, { meseScadenza: 6, annoScadenza: 2026 }); // 30 giugno
      await creaScadenza(veicolo.id, { meseScadenza: 7, annoScadenza: 2026 }); // 31 luglio

      const entro30 = await withFrozenTime(ADESSO, () =>
        scadenze.getScadenzeInScadenza(30),
      );
      const entro60 = await withFrozenTime(ADESSO, () =>
        scadenze.getScadenzeInScadenza(60),
      );

      // Dal 15 giugno: il 30 giugno è entro 30 giorni, il 31 luglio no.
      expect(entro30.map((s) => s.meseScadenza)).toEqual([6]);
      expect(entro60.map((s) => s.meseScadenza)).toEqual([6, 7]);
    });

    it('la generazione futura scrive una data coerente', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id, {
        dataImmatricolazione: new Date(Date.UTC(2010, 1, 15)), // febbraio
      });

      await withFrozenTime(ADESSO, () => scadenze.generaScadenzeFuture(2028));

      const create = await prisma.scadenza.findMany({
        where: { idVeicolo: veicolo.id },
        orderBy: { dataScadenza: 'asc' },
      });

      expect(create.length).toBeGreaterThan(0);
      for (const s of create) {
        // Il vincolo CHECK garantisce già la coerenza, ma qui si verifica
        // anche che la data sia l'ultimo giorno del mese, febbraio bisestile
        // compreso.
        expect(s.dataScadenza).toEqual(
          ultimoGiornoDelMese(s.annoScadenza, s.meseScadenza),
        );
      }
      const bisestile = create.find((s) => s.annoScadenza === 2028);
      expect(bisestile.dataScadenza.toISOString().slice(0, 10)).toBe('2028-02-29');
    });
  });

  // =====================================================
  // VINCOLI DI DOMINIO
  // =====================================================

  describe('vincoli di dominio sui veicoli', () => {
    it('rifiuta un tipo veicolo non previsto', async () => {
      const cliente = await creaCliente();

      await expect(
        prisma.veicolo.create({
          data: {
            idCliente: cliente.id,
            targa: 'XX000XX',
            // Minuscolo: il motore di calcolo non lo riconoscerebbe e
            // produrrebbe zero euro senza segnalare nulla.
            tipoVeicolo: 'autovettura',
          },
        }),
      ).rejects.toThrow(/veicoli_tipo_veicolo_valido/);
    });

    it('rifiuta una classe ambientale scritta diversamente', async () => {
      const cliente = await creaCliente();

      await expect(
        prisma.veicolo.create({
          data: {
            idCliente: cliente.id,
            targa: 'XX001XX',
            classeAmbientale: 'EURO 6',
          },
        }),
      ).rejects.toThrow(/veicoli_classe_ambientale_valida/);
    });

    it('rifiuta una regione inesistente', async () => {
      const cliente = await creaCliente();

      await expect(
        prisma.veicolo.create({
          data: {
            idCliente: cliente.id,
            targa: 'XX002XX',
            regione: 'Padania',
          },
        }),
      ).rejects.toThrow(/veicoli_regione_valida/);
    });

    it('rifiuta una potenza pari a zero', async () => {
      // Zero non è una potenza: significava "non rilevato" ed è la ragione per
      // cui la lacuna dei dati era invisibile.
      const cliente = await creaCliente();

      await expect(
        prisma.veicolo.create({
          data: {
            idCliente: cliente.id,
            targa: 'XX003XX',
            potenzaKw: 0,
          },
        }),
      ).rejects.toThrow(/veicoli_grandezze_positive/);
    });

    it('accetta i campi non valorizzati', async () => {
      // I NULL restano ammessi: il dato mancante è una lacuna da sanare, non
      // un errore di validità.
      const cliente = await creaCliente();

      const veicolo = await prisma.veicolo.create({
        data: { idCliente: cliente.id, targa: 'XX004XX' },
      });

      expect(veicolo.tipoVeicolo).toBeNull();
      expect(veicolo.potenzaKw).toBeNull();
    });

    it('rifiuta un importo negativo su scadenze e pagamenti', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id);

      await expect(
        prisma.scadenza.create({
          data: {
            idVeicolo: veicolo.id,
            dataScadenza: new Date(Date.UTC(2026, 5, 30)),
            meseScadenza: 6,
            annoScadenza: 2026,
            periodicita: 'ANNUALE',
            importoPrevisto: -1,
          },
        }),
      ).rejects.toThrow(/scadenze_importo_non_negativo/);

      const scadenza = await creaScadenza(veicolo.id);
      await expect(
        prisma.pagamento.create({
          data: {
            idScadenza: scadenza.id,
            dataPagamento: new Date(Date.UTC(2026, 5, 20)),
            importoPagato: -50,
          },
        }),
      ).rejects.toThrow(/pagamenti_importo_non_negativo/);
    });
  });

  // =====================================================
  // VALIDITÀ DEL TARIFFARIO
  // =====================================================

  describe('validità del tariffario', () => {
    it('il seed valorizza l\'intervallo di validità sull\'anno solare', async () => {
      const config = await prisma.configurazioneBollo.findFirst({
        where: { regione: 'Lombardia', annoValidita: 2026 },
      });

      expect(config.validoDa.toISOString().slice(0, 10)).toBe('2026-01-01');
      expect(config.validoA.toISOString().slice(0, 10)).toBe('2026-12-31');
    });

    it('rifiuta un intervallo che finisce prima di iniziare', async () => {
      await expect(
        prisma.configurazioneBollo.create({
          data: {
            annoValidita: 2027,
            regione: 'Piemonte',
            validoDa: new Date(Date.UTC(2027, 5, 1)),
            validoA: new Date(Date.UTC(2027, 0, 1)),
            scontoRid: 0,
          },
        }),
      ).rejects.toThrow(/configurazioni_bollo_intervallo_valido/);
    });

    it('ammette un tariffario ancora in vigore, senza data di fine', async () => {
      const config = await prisma.configurazioneBollo.create({
        data: {
          annoValidita: 2027,
          regione: 'Piemonte',
          validoDa: new Date(Date.UTC(2027, 0, 1)),
          validoA: null,
          scontoRid: 0,
        },
      });

      expect(config.validoA).toBeNull();
    });
  });
});
