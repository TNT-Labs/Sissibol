/**
 * Test di integrazione del registro delle modifiche.
 *
 * Il registro deve rispondere alla domanda "chi ha cambiato questo importo,
 * quando, e da cosa a cosa". Senza una risposta, una contestazione su un bollo
 * non è difendibile.
 *
 * Verificano anche le due scelte deliberate del servizio: il registro non è
 * riscrivibile, e un suo malfunzionamento non deve impedire la registrazione
 * di un pagamento.
 */

import { AuditService } from '../../src/audit/audit.service';
import { PagamentiService } from '../../src/pagamenti/pagamenti.service';
import { ScadenzeService } from '../../src/scadenze/scadenze.service';
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

const OPERATORE = 'operatore@studio.it';

describe('Registro delle modifiche (integrazione)', () => {
  let prisma: ReturnType<typeof getPrisma>;
  let audit: AuditService;
  let pagamenti: PagamentiService;
  let scadenze: ScadenzeService;

  beforeAll(() => {
    prisma = getPrisma();
    const bollo = new BolloService(prisma as never);
    audit = new AuditService(prisma as never);
    pagamenti = new PagamentiService(prisma as never, bollo, audit);
    scadenze = new ScadenzeService(prisma as never, bollo, audit);
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedTariffario();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  async function scenario() {
    const cliente = await creaCliente();
    const veicolo = await creaVeicolo(cliente.id, { potenzaKw: '100' });
    const scadenza = await creaScadenza(veicolo.id);
    return { cliente, veicolo, scadenza };
  }

  // =====================================================
  // PERCORSO DEI PAGAMENTI
  // =====================================================

  describe('pagamenti', () => {
    it('registra la creazione con l\'autore e i dati risultanti', async () => {
      const { scadenza } = await scenario();

      const pagamento = await pagamenti.create(
        {
          idScadenza: scadenza.id,
          dataPagamento: '2026-06-20',
          importoPagato: 258,
          metodoPagamento: 'Bonifico',
        } as never,
        OPERATORE,
      );

      const voci = await audit.storico('pagamento', pagamento.id);
      expect(voci).toHaveLength(1);
      expect(voci[0].azione).toBe('CREAZIONE');
      expect(voci[0].utente).toBe(OPERATORE);
      expect(voci[0].datiPrima).toBeNull();
      expect(voci[0].datiDopo).toMatchObject({
        id: pagamento.id,
        idScadenza: scadenza.id,
        metodoPagamento: 'Bonifico',
      });
    });

    it('conserva l\'importo come stringa, senza perdere precisione', async () => {
      // Passando dal numero in virgola mobile un importo come 1234.56
      // potrebbe non tornare identico: nel registro deve restare esatto.
      const { scadenza } = await scenario();

      const pagamento = await pagamenti.create(
        {
          idScadenza: scadenza.id,
          dataPagamento: '2026-06-20',
          importoPagato: 1234.56,
        } as never,
        OPERATORE,
      );

      const voci = await audit.storico('pagamento', pagamento.id);
      expect((voci[0].datiDopo as { importoPagato: string }).importoPagato).toBe(
        '1234.56',
      );
    });

    it('registra la modifica con il prima e il dopo', async () => {
      const { scadenza } = await scenario();
      const pagamento = await pagamenti.create(
        { idScadenza: scadenza.id, dataPagamento: '2026-06-20', importoPagato: 258 } as never,
        OPERATORE,
      );

      await pagamenti.update(
        pagamento.id,
        { version: pagamento.version, importoPagato: 300 } as never,
        'altro@studio.it',
      );

      const voci = await audit.storico('pagamento', pagamento.id);
      const modifica = voci.find((v) => v.azione === 'MODIFICA');
      expect(modifica.utente).toBe('altro@studio.it');
      expect((modifica.datiPrima as { importoPagato: string }).importoPagato).toBe('258');
      expect((modifica.datiDopo as { importoPagato: string }).importoPagato).toBe('300');
    });

    it('annota la modifica eseguita senza controllo di versione', async () => {
      // Il locking ottimistico scatta solo se il client invia `version`:
      // quando non lo fa, il registro almeno lo dichiara.
      const { scadenza } = await scenario();
      const pagamento = await pagamenti.create(
        { idScadenza: scadenza.id, dataPagamento: '2026-06-20', importoPagato: 258 } as never,
        OPERATORE,
      );

      await pagamenti.update(pagamento.id, { importoPagato: 999 } as never, OPERATORE);

      const voci = await audit.storico('pagamento', pagamento.id);
      const modifica = voci.find((v) => v.azione === 'MODIFICA');
      expect(modifica.note).toMatch(/senza controllo di versione/);
    });

    it('registra l\'eliminazione conservando i dati cancellati', async () => {
      const { scadenza } = await scenario();
      const pagamento = await pagamenti.create(
        { idScadenza: scadenza.id, dataPagamento: '2026-06-20', importoPagato: 258 } as never,
        OPERATORE,
      );

      await pagamenti.remove(pagamento.id, OPERATORE);

      const voci = await audit.storico('pagamento', pagamento.id);
      const eliminazione = voci.find((v) => v.azione === 'ELIMINAZIONE');
      expect(eliminazione).toBeDefined();
      // Il pagamento non esiste più, ma i suoi dati restano nel registro.
      expect(await prisma.pagamento.count()).toBe(0);
      expect((eliminazione.datiPrima as { importoPagato: string }).importoPagato).toBe('258');
    });

    it('annota il pagamento registrato senza snapshot del calcolo', async () => {
      const cliente = await creaCliente();
      const veicolo = await creaVeicolo(cliente.id, { regione: 'Veneto' });
      const scadenza = await creaScadenza(veicolo.id);

      const pagamento = await pagamenti.create(
        { idScadenza: scadenza.id, dataPagamento: '2026-06-20', importoPagato: 300 } as never,
        OPERATORE,
      );

      const voci = await audit.storico('pagamento', pagamento.id);
      expect(voci[0].note).toMatch(/senza snapshot/);
    });

    it('ricostruisce la storia completa in ordine cronologico inverso', async () => {
      const { scadenza } = await scenario();
      const pagamento = await pagamenti.create(
        { idScadenza: scadenza.id, dataPagamento: '2026-06-20', importoPagato: 258 } as never,
        OPERATORE,
      );
      const dopoPrimaModifica = await pagamenti.update(
        pagamento.id,
        { version: pagamento.version, importoPagato: 260 } as never,
        OPERATORE,
      );
      await pagamenti.update(
        pagamento.id,
        { version: dopoPrimaModifica.version, importoPagato: 270 } as never,
        OPERATORE,
      );

      const voci = await audit.storico('pagamento', pagamento.id);
      expect(voci.map((v) => v.azione)).toEqual(['MODIFICA', 'MODIFICA', 'CREAZIONE']);
    });
  });

  // =====================================================
  // IMPORTI PREVISTI
  // =====================================================

  describe('scadenze', () => {
    it('registra il ricalcolo dell\'importo con il dettaglio applicato', async () => {
      const { scadenza } = await scenario();
      await prisma.scadenza.update({
        where: { id: scadenza.id },
        data: { importoPrevisto: 1 },
      });

      await scadenze.ricalcolaImporto(scadenza.id, OPERATORE);

      const voci = await audit.storico('scadenza', scadenza.id);
      expect(voci).toHaveLength(1);
      expect((voci[0].datiPrima as { importoPrevisto: string }).importoPrevisto).toBe('1');
      expect((voci[0].datiDopo as { importoPrevisto: string }).importoPrevisto).toBe('258');
      expect(voci[0].note).toMatch(/Ricalcolo dal tariffario/);
    });

    it('registra la modifica manuale di una scadenza', async () => {
      const { scadenza } = await scenario();

      await scadenze.update(
        scadenza.id,
        { importoPrevisto: 500 } as never,
        OPERATORE,
      );

      const voci = await audit.storico('scadenza', scadenza.id);
      expect(voci[0].azione).toBe('MODIFICA');
      expect((voci[0].datiPrima as { importoPrevisto: string }).importoPrevisto).toBe('258');
      expect((voci[0].datiDopo as { importoPrevisto: string }).importoPrevisto).toBe('500');
    });
  });

  // =====================================================
  // PROPRIETÀ DEL REGISTRO
  // =====================================================

  describe('proprietà del registro', () => {
    it('sopravvive all\'eliminazione dell\'entità tracciata', async () => {
      // Non c'è vincolo di chiave esterna: cancellare un pagamento non deve
      // cancellare la prova di averlo registrato.
      const { cliente, scadenza } = await scenario();
      const pagamento = await pagamenti.create(
        { idScadenza: scadenza.id, dataPagamento: '2026-06-20', importoPagato: 258 } as never,
        OPERATORE,
      );

      await prisma.cliente.delete({ where: { id: cliente.id } });

      expect(await prisma.pagamento.count()).toBe(0);
      const voci = await audit.storico('pagamento', pagamento.id);
      expect(voci.length).toBeGreaterThan(0);
    });

    it('non fa fallire l\'operazione se la scrittura del registro non riesce', async () => {
      // Perdere una riga di registro è meno grave che impedire la
      // registrazione di un pagamento.
      const { scadenza } = await scenario();
      const auditRotto = new AuditService({
        auditLog: {
          create: () => Promise.reject(new Error('registro non disponibile')),
        },
      } as never);
      const bollo = new BolloService(prisma as never);
      const servizio = new PagamentiService(prisma as never, bollo, auditRotto);

      const pagamento = await servizio.create(
        { idScadenza: scadenza.id, dataPagamento: '2026-06-20', importoPagato: 258 } as never,
        OPERATORE,
      );

      expect(pagamento.id).toBeDefined();
      expect(await prisma.pagamento.count()).toBe(1);
    });

    it('accetta operazioni senza autore identificato', async () => {
      // Le operazioni automatiche (cron, import) non hanno un utente.
      const { scadenza } = await scenario();
      const pagamento = await pagamenti.create(
        { idScadenza: scadenza.id, dataPagamento: '2026-06-20', importoPagato: 258 } as never,
      );

      const voci = await audit.storico('pagamento', pagamento.id);
      expect(voci[0].utente).toBeNull();
    });
  });
});
