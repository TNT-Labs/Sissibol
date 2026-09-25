/**
 * Test di integrazione della migrazione sugli importi segnaposto.
 *
 * L'archivio Access segnava con 1 euro le scadenze di cui non conosceva il
 * bollo. La migrazione 20260926000000_importi_segnaposto_archivio rende quegli
 * importi mancanti (NULL) sulle scadenze non pagate, lasciando intatte quelle
 * pagate, e registra ogni modifica nel registro con il valore precedente.
 *
 * Il test esegue il file SQL della migrazione, lo stesso applicato in
 * produzione, su righe costruite per coprire ogni caso: quelli da correggere e
 * soprattutto quelli da NON toccare.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  creaCliente,
  creaScadenza,
  creaVeicolo,
  disconnectPrisma,
  getPrisma,
  resetDatabase,
} from './setup/test-db';

const MIGRAZIONE = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260926000000_importi_segnaposto_archivio/migration.sql',
  ),
  'utf-8',
);

describe('Migrazione degli importi segnaposto (integrazione)', () => {
  const prisma = getPrisma();

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  async function scenario() {
    const cliente = await creaCliente();
    const veicolo = await creaVeicolo(cliente.id);
    const s = (override: Parameters<typeof creaScadenza>[1]) => creaScadenza(veicolo.id, override);

    const daPagare = await s({ importoPrevisto: '1', stato: 'DA_PAGARE', annoScadenza: 2027 });
    const scaduta = await s({ importoPrevisto: '1', stato: 'SCADUTO', annoScadenza: 2020 });
    const pagata = await s({ importoPrevisto: '1', stato: 'PAGATO', annoScadenza: 2019 });
    await prisma.pagamento.create({
      data: { idScadenza: pagata.id, dataPagamento: new Date(Date.UTC(2019, 5, 20)), importoPagato: 1 },
    });
    // Stato incoerente con un pagamento presente: per prudenza non si tocca.
    const conPagamento = await s({ importoPrevisto: '1', stato: 'DA_PAGARE', annoScadenza: 2021 });
    await prisma.pagamento.create({
      data: { idScadenza: conPagamento.id, dataPagamento: new Date(Date.UTC(2021, 5, 20)), importoPagato: 1 },
    });
    const reale = await s({ importoPrevisto: '258', stato: 'DA_PAGARE', annoScadenza: 2028 });
    const unoEMezzo = await s({ importoPrevisto: '1.50', stato: 'DA_PAGARE', annoScadenza: 2029 });
    const mancante = await s({ importoPrevisto: null, stato: 'DA_PAGARE', annoScadenza: 2030 });

    return { daPagare, scaduta, pagata, conPagamento, reale, unoEMezzo, mancante };
  }

  async function importo(id: number): Promise<string | null> {
    const s = await prisma.scadenza.findUnique({ where: { id } });
    return s.importoPrevisto === null ? null : s.importoPrevisto.toString();
  }

  it('rende mancante il segnaposto sulle scadenze da pagare e scadute', async () => {
    const sc = await scenario();

    await prisma.$executeRawUnsafe(MIGRAZIONE);

    expect(await importo(sc.daPagare.id)).toBeNull();
    expect(await importo(sc.scaduta.id)).toBeNull();
  });

  it('non tocca le scadenze pagate né quelle con un pagamento', async () => {
    const sc = await scenario();

    await prisma.$executeRawUnsafe(MIGRAZIONE);

    expect(await importo(sc.pagata.id)).toBe('1');
    expect(await importo(sc.conPagamento.id)).toBe('1');
    expect(await prisma.pagamento.count({ where: { importoPagato: 1 } })).toBe(2);
  });

  it('non tocca gli importi reali, quelli diversi da 1 e quelli già mancanti', async () => {
    const sc = await scenario();

    await prisma.$executeRawUnsafe(MIGRAZIONE);

    expect(await importo(sc.reale.id)).toBe('258');
    expect(await importo(sc.unoEMezzo.id)).toBe('1.5');
    expect(await importo(sc.mancante.id)).toBeNull();
  });

  it('registra ogni modifica con il valore precedente, e solo quelle', async () => {
    const sc = await scenario();

    await prisma.$executeRawUnsafe(MIGRAZIONE);

    const voci = await prisma.auditLog.findMany({ orderBy: { idEntita: 'asc' } });
    expect(voci.map((v) => v.idEntita)).toEqual([sc.daPagare.id, sc.scaduta.id]);
    for (const v of voci) {
      expect(v.entita).toBe('scadenza');
      expect(v.azione).toBe('MODIFICA');
      expect(v.datiPrima).toEqual({ importoPrevisto: '1' });
      expect(v.datiDopo).toEqual({ importoPrevisto: null });
      expect(v.note).toMatch(/segnaposto/);
    }
  });

  it('è ripetibile: una seconda esecuzione non cambia nulla', async () => {
    await scenario();

    await prisma.$executeRawUnsafe(MIGRAZIONE);
    const dopoPrima = await prisma.auditLog.count();
    await prisma.$executeRawUnsafe(MIGRAZIONE);

    expect(await prisma.auditLog.count()).toBe(dopoPrima);
  });

  it('è reversibile a partire dal registro delle modifiche', async () => {
    // La prova che il registro basta a ripristinare lo stato precedente.
    const sc = await scenario();
    await prisma.$executeRawUnsafe(MIGRAZIONE);

    await prisma.$executeRawUnsafe(`
      UPDATE "scadenze" s
      SET "importo_previsto" = (a."dati_prima"->>'importoPrevisto')::numeric
      FROM "audit_log" a
      WHERE a."entita" = 'scadenza' AND a."id_entita" = s."id"
        AND a."note" LIKE 'Migrazione 20260926000000%'
    `);

    expect(await importo(sc.daPagare.id)).toBe('1');
    expect(await importo(sc.scaduta.id)).toBe('1');
  });
});
