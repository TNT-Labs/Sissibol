/**
 * Test di integrazione della garanzia centrale del motore 2:
 * un bollo non calcolabile non diventa MAI un importo.
 *
 * Con il motore precedente un veicolo senza potenza produceva un bollo di zero
 * euro, e quello zero finiva ovunque: importo previsto delle scadenze create o
 * generate, ricalcoli che cancellavano importi importati dall'archivio,
 * snapshot di pagamento che "provavano" un importo di zero euro. Questi test
 * attraversano ciascun servizio con un veicolo non calcolabile.
 */

import { ScadenzeService } from '../../src/scadenze/scadenze.service';
import { PagamentiService } from '../../src/pagamenti/pagamenti.service';
import { BolloService } from '../../src/bollo/bollo.service';
import { AuditService } from '../../src/audit/audit.service';
import { VERSIONE_MOTORE } from '../../src/bollo/motore';
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

describe('Importi e motore di calcolo (integrazione)', () => {
  let prisma: ReturnType<typeof getPrisma>;
  let bollo: BolloService;
  let scadenze: ScadenzeService;
  let pagamenti: PagamentiService;

  beforeAll(() => {
    prisma = getPrisma();
    const audit = new AuditService(prisma as never);
    bollo = new BolloService(prisma as never, audit);
    scadenze = new ScadenzeService(prisma as never, bollo, audit);
    pagamenti = new PagamentiService(prisma as never, bollo, audit);
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedTariffario();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  /** Autovettura senza potenza: il caso di 2.316 veicoli dell'archivio reale. */
  async function veicoloNonCalcolabile() {
    const cliente = await creaCliente();
    const veicolo = await creaVeicolo(cliente.id, { dataImmatricolazione: new Date(Date.UTC(2010, 2, 31)) });
    await prisma.veicolo.update({ where: { id: veicolo.id }, data: { potenzaKw: null } });
    return veicolo;
  }

  it('la creazione di una scadenza lascia l\'importo vuoto, non zero', async () => {
    const veicolo = await veicoloNonCalcolabile();

    const scadenza = await scadenze.create({
      idVeicolo: veicolo.id,
      meseScadenza: 6,
      annoScadenza: 2026,
      periodicita: 'ANNUALE',
    } as never);

    expect(scadenza.importoPrevisto).toBeNull();
  });

  it('il ricalcolo rifiuta di sovrascrivere l\'importo esistente', async () => {
    const veicolo = await veicoloNonCalcolabile();
    // Importo importato dall'archivio Access
    const scadenza = await creaScadenza(veicolo.id, { importoPrevisto: '233.10' });

    await expect(scadenze.ricalcolaImporto(scadenza.id)).rejects.toThrow(/potenza \(KW\)/);

    const dopo = await prisma.scadenza.findUnique({ where: { id: scadenza.id } });
    expect(Number(dopo.importoPrevisto)).toBe(233.1);
  });

  it('l\'aggiornamento massivo non tocca gli importi non ricalcolabili', async () => {
    const veicolo = await veicoloNonCalcolabile();
    const scadenza = await creaScadenza(veicolo.id, {
      importoPrevisto: '233.10',
      annoScadenza: new Date().getFullYear() + 1,
    });

    const esito = await bollo.aggiornaImportiScadenze(veicolo.id);

    expect(esito.aggiornate).toBe(0);
    expect(esito.nonCalcolabili).toBe(1);
    const dopo = await prisma.scadenza.findUnique({ where: { id: scadenza.id } });
    expect(Number(dopo.importoPrevisto)).toBe(233.1);
  });

  it('la generazione futura crea scadenze senza importo e le conta', async () => {
    const veicolo = await veicoloNonCalcolabile();

    const esito = await withFrozenTime(ADESSO, () => scadenze.generaScadenzeFuture(2027));

    expect(esito.scadenzeCreate).toBeGreaterThan(0);
    expect(esito.scadenzeSenzaImporto).toBe(esito.scadenzeCreate);
    const create = await prisma.scadenza.findMany({ where: { idVeicolo: veicolo.id } });
    expect(create.every((s) => s.importoPrevisto === null)).toBe(true);
  });

  it('un pagamento su bollo non calcolabile non produce uno snapshot a zero', async () => {
    const veicolo = await veicoloNonCalcolabile();
    const scadenza = await creaScadenza(veicolo.id, { importoPrevisto: '233.10' });

    const pagamento = await pagamenti.create({
      idScadenza: scadenza.id,
      dataPagamento: '2026-06-20',
      importoPagato: 233.1,
    } as never);

    // Il pagamento è un fatto e viene registrato...
    expect(Number(pagamento.importoPagato)).toBe(233.1);
    // ...ma non esiste un calcolo da congelare.
    const snapshot = await prisma.snapshotCalcoloBollo.findUnique({
      where: { idPagamento: pagamento.id },
    });
    expect(snapshot).toBeNull();
    const [voce] = await prisma.auditLog.findMany({ where: { entita: 'pagamento', idEntita: pagamento.id } });
    expect(voce.note).toMatch(/bollo non calcolabile.*potenza/);
  });

  it('lo snapshot registra la versione del motore e le assunzioni', async () => {
    const cliente = await creaCliente();
    // Senza data di immatricolazione: la riduzione per anzianità non è valutabile.
    const veicolo = await creaVeicolo(cliente.id, { potenzaKw: '100' });
    const scadenza = await creaScadenza(veicolo.id);

    const pagamento = await pagamenti.create({
      idScadenza: scadenza.id,
      dataPagamento: '2026-06-20',
      importoPagato: 258,
    } as never);

    const snapshot = await prisma.snapshotCalcoloBollo.findUnique({
      where: { idPagamento: pagamento.id },
    });
    expect(snapshot.versioneMotore).toBe(VERSIONE_MOTORE);
    expect(snapshot.assunzioni).toEqual([
      expect.stringContaining('Data di immatricolazione non indicata'),
    ]);
  });

  it('lo snapshot riporta il tariffario effettivamente applicato', async () => {
    // Il calcolo è su tariffario Lombardia: lo snapshot lo deve dire, e non
    // ricavarlo dalla regione del veicolo come faceva la versione precedente.
    const cliente = await creaCliente();
    const veicolo = await creaVeicolo(cliente.id, { potenzaKw: '100' });
    const scadenza = await creaScadenza(veicolo.id);
    const config = await prisma.configurazioneBollo.findFirst({ where: { regione: 'Lombardia' } });

    const pagamento = await pagamenti.create({
      idScadenza: scadenza.id,
      dataPagamento: '2026-06-20',
      importoPagato: 258,
    } as never);

    const snapshot = await prisma.snapshotCalcoloBollo.findUnique({
      where: { idPagamento: pagamento.id },
    });
    expect(snapshot.idConfigurazione).toBe(config.id);
    expect(snapshot.regioneConfigurazione).toBe('Lombardia');
  });

  it('una scadenza quadrimestrale di un\'autovettura non riceve l\'importo annuale', async () => {
    // Il motore precedente applicava l'importo annuale: tre volte l'anno.
    const cliente = await creaCliente();
    const veicolo = await creaVeicolo(cliente.id, { potenzaKw: '100' });

    const scadenza = await scadenze.create({
      idVeicolo: veicolo.id,
      meseScadenza: 6,
      annoScadenza: 2026,
      periodicita: 'QUADRIMESTRALE',
    } as never);

    expect(scadenza.importoPrevisto).toBeNull();
  });
});
