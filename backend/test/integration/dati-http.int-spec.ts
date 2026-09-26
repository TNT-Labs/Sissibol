/**
 * Liste e report via HTTP sull'applicazione completa: ricerca delle scadenze
 * da pagare, limiti alle risposte, report Excel e PDF generati dal server.
 */

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import * as ExcelJS from 'exceljs';
import { readdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { disconnectPrisma, getPrisma, getTestDatabaseUrl, resetDatabase } from './setup/test-db';

const PASSWORD = 'Tassa#Automobilistica-42';
const d = (anno: number, mese: number, giorno = 1) => new Date(Date.UTC(anno, mese - 1, giorno));

describe('Liste e report (HTTP)', () => {
  let app: INestApplication;
  let base: string;
  let token: string;
  const prisma = getPrisma();
  let ip = 1;
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = getTestDatabaseUrl();
    process.env.JWT_SECRET = 'segreto-dei-test-di-integrazione-abbastanza-lungo';
    process.env.TRUST_PROXY = 'true';

    const { AppModule } = await import('../../src/app.module');
    const { configuraApp } = await import('../../src/configura-app');
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
    configuraApp(app as NestExpressApplication);
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  });

  beforeEach(async () => {
    await resetDatabase();
    await prisma.utente.create({
      data: { email: 'admin@studio.it', password: await bcrypt.hash(PASSWORD, 4), ruolo: 'ADMIN' },
    });

    const rossi = await prisma.cliente.create({
      data: { tipoCliente: 'PERSONA_FISICA', nome: 'Mario', cognome: 'Rossi', email: 'mario@rossi.it' },
    });
    const alfa = await prisma.cliente.create({ data: { ragioneSociale: 'Trasporti Alfa SRL', partitaIva: '01234567890' } });
    const cessato = await prisma.cliente.create({ data: { ragioneSociale: 'Cessata SNC', attivo: false } });
    ids.rossi = rossi.id;
    ids.alfa = alfa.id;

    const ab = await prisma.veicolo.create({ data: { idCliente: rossi.id, targa: 'AB123CD', tipoVeicolo: 'Autovettura' } });
    const xy = await prisma.veicolo.create({ data: { idCliente: alfa.id, targa: 'XY987ZW', tipoVeicolo: 'Autocarro' } });
    await prisma.veicolo.create({ data: { idCliente: alfa.id, targa: 'ZZ000ZZ', attivo: false } });
    const vc = await prisma.veicolo.create({ data: { idCliente: cessato.id, targa: 'CC111CC' } });
    ids.ab = ab.id;

    const scadenza = (idVeicolo: number, data: Date, stato: string, importo: number | null) =>
      prisma.scadenza.create({
        data: {
          idVeicolo,
          dataScadenza: data,
          meseScadenza: data.getUTCMonth() + 1,
          annoScadenza: data.getUTCFullYear(),
          stato: stato as never,
          importoPrevisto: importo,
        },
      });
    const pagata = await scadenza(ab.id, d(2024, 3), 'PAGATO', 90);
    await scadenza(ab.id, d(2025, 3), 'SCADUTO', 100.5);
    await scadenza(ab.id, d(2026, 3), 'DA_PAGARE', 110);
    await scadenza(ab.id, d(2027, 3), 'DA_PAGARE', null);
    await scadenza(xy.id, d(2026, 6), 'DA_PAGARE', 250.25);
    await scadenza(vc.id, d(2026, 1), 'DA_PAGARE', 70); // cliente non attivo: esclusa ovunque

    await prisma.pagamento.create({
      data: { idScadenza: pagata.id, dataPagamento: d(2024, 3, 10), importoPagato: 90, metodoPagamento: 'Bonifico' },
    });

    const login = await richiesta('POST', '/auth/login', { corpo: { email: 'admin@studio.it', password: PASSWORD } });
    token = login.json.access_token;
  });

  afterAll(async () => {
    await app?.close();
    await disconnectPrisma();
  });

  /** Ogni richiesta da un IP diverso: i limiti per client non interferiscono fra i test. */
  async function richiesta(metodo: string, percorso: string, opzioni: { corpo?: unknown; senzaToken?: boolean } = {}) {
    const risposta = await fetch(base + percorso, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': `198.51.100.${ip++ % 250}`,
        ...(token && !opzioni.senzaToken ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opzioni.corpo === undefined ? undefined : JSON.stringify(opzioni.corpo),
    });
    const buffer = Buffer.from(await risposta.arrayBuffer());
    let json: any = null;
    try {
      json = JSON.parse(buffer.toString('utf8'));
    } catch {
      json = null;
    }
    return { stato: risposta.status, json, buffer, intestazioni: risposta.headers };
  }

  async function leggiExcel(buffer: Buffer) {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    const foglio = libro.worksheets[0];
    const righe: unknown[][] = [];
    foglio.eachRow({ includeEmpty: true }, (riga) => righe.push((riga.values as unknown[]).slice(1)));
    return { foglio, righe };
  }

  describe('ricerca delle scadenze da pagare', () => {
    it('trova le scadenze non pagate per cliente e targa, le più vecchie per prime', async () => {
      const r = await richiesta('GET', '/scadenze/cerca?q=rossi');

      expect(r.stato).toBe(200);
      expect(r.json.map((s: any) => [s.annoScadenza, s.stato])).toEqual([
        [2025, 'SCADUTO'],
        [2026, 'DA_PAGARE'],
        [2027, 'DA_PAGARE'],
      ]);
      expect(r.json[0].veicolo).toEqual({
        id: ids.ab,
        targa: 'AB123CD',
        cliente: expect.objectContaining({ cognome: 'Rossi' }),
      });
    });

    it('ogni parola deve comparire nella targa o nel nome del cliente', async () => {
      expect((await richiesta('GET', '/scadenze/cerca?q=mario%20ab123')).json).toHaveLength(3);
      expect((await richiesta('GET', '/scadenze/cerca?q=alfa%20xy9')).json).toHaveLength(1);
      expect((await richiesta('GET', '/scadenze/cerca?q=alfa%20ab123')).json).toHaveLength(0);
    });

    it('senza testo propone le prime non pagate, esclusi clienti non attivi; il limite vale', async () => {
      const tutte = await richiesta('GET', '/scadenze/cerca');
      expect(tutte.json.map((s: any) => s.veicolo.targa)).toEqual(['AB123CD', 'AB123CD', 'XY987ZW', 'AB123CD']);
      expect((await richiesta('GET', '/scadenze/cerca?limite=2')).json).toHaveLength(2);
      expect((await richiesta('GET', '/scadenze/cerca?limite=abc')).stato).toBe(200);
    });
  });

  describe('ricerca di veicoli e clienti', () => {
    const targhe = async (q: string, extra = '') =>
      (await richiesta('GET', `/veicoli/paginated?search=${encodeURIComponent(q)}${extra}`)).json.data.map((v: any) => v.targa);

    it('veicoli: ogni parola nella targa o nel nome del cliente, in qualsiasi ordine', async () => {
      expect(await targhe('Rossi Mario')).toEqual(['AB123CD']);
      expect(await targhe('mario ab12')).toEqual(['AB123CD']);
      expect(await targhe('alfa')).toEqual(['XY987ZW']);
      expect(await targhe('rossi alfa')).toEqual([]);
      // Disattivati a parte; i veicoli di clienti non attivi mai.
      expect(await targhe('alfa', '&attivo=false')).toEqual(['ZZ000ZZ']);
      expect(await targhe('cessata')).toEqual([]);
    });

    it('clienti: ogni parola in un campo qualsiasi; parametro ripetuto senza errori', async () => {
      const nomi = async (q: string) =>
        (await richiesta('GET', `/clienti/paginated?${q}`)).json.data.map((c: any) => c.cognome ?? c.ragioneSociale);
      expect(await nomi('search=Rossi%20Mario')).toEqual(['Rossi']);
      expect(await nomi('search=trasporti%2001234')).toEqual(['Trasporti Alfa SRL']);
      expect((await richiesta('GET', '/clienti/paginated?search=a&search=b')).stato).toBe(200);
    });

    it('clienti: la lista ha tutti i campi del modulo di modifica', async () => {
      await prisma.cliente.update({
        where: { id: ids.rossi },
        data: { indirizzo: 'Via Roma 1', note: 'Paga in contanti', avvisiEmail: false },
      });
      const [rossi] = (await richiesta('GET', '/clienti/paginated?search=rossi')).json.data;
      expect(rossi).toEqual(
        expect.objectContaining({ indirizzo: 'Via Roma 1', note: 'Paga in contanti', avvisiEmail: false, attivo: true }),
      );
    });
  });

  describe('ricevute dei pagamenti (caricamento multipart)', () => {
    const invia = async (file: Blob, nome: string) => {
      const scadenza = await prisma.scadenza.findFirst({ where: { stato: 'DA_PAGARE', veicolo: { targa: 'XY987ZW' } } });
      const modulo = new FormData();
      modulo.append('idScadenza', String(scadenza.id));
      modulo.append('dataPagamento', '2026-06-10');
      modulo.append('importoPagato', '250.25');
      modulo.append('ricevuta', file, nome);
      const r = await fetch(`${base}/pagamenti`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': `198.51.100.${ip++ % 250}` },
        body: modulo,
      });
      return { stato: r.status, json: await r.json() };
    };

    it('una ricevuta PDF si carica e si riscarica identica', async () => {
      const contenuto = Buffer.from('%PDF-1.4\n% ricevuta di prova\n%%EOF\n');
      const creato = await invia(new Blob([contenuto], { type: 'application/pdf' }), 'ricevuta.pdf');
      expect(creato.stato).toBe(201);
      expect(creato.json.ricevutaFile).toMatch(/^ricevuta-\d+-\d+\.pdf$/);

      try {
        const r = await richiesta('GET', `/pagamenti/${creato.json.id}/ricevuta`);
        expect(r.stato).toBe(200);
        expect(r.intestazioni.get('content-type')).toBe('application/pdf');
        expect(r.buffer.equals(contenuto)).toBe(true);
      } finally {
        rmSync(join('uploads/ricevute', creato.json.ricevutaFile), { force: true });
      }
    });

    it('tipi non ammessi o travestiti e file oltre 5 MB sono respinti, senza lasciare file', async () => {
      const inizio = Date.now();
      expect((await invia(new Blob(['MZ'], { type: 'application/x-msdownload' }), 'programma.exe')).stato).toBe(400);
      expect((await invia(new Blob(['<script>'], { type: 'text/html' }), 'finto.pdf')).stato).toBe(400);
      // Tipo ed estensione dichiarati coerenti, ma il contenuto è una pagina HTML.
      const travestito = await invia(new Blob(['<html><script>alert(1)</script>'], { type: 'application/pdf' }), 'ricevuta.pdf');
      expect(travestito.stato).toBe(400);
      expect(travestito.json.message).toMatch(/contenuto del file non corrisponde/);
      expect(readdirSync('uploads/ricevute').filter((f) => statSync(join('uploads/ricevute', f)).mtimeMs > inizio)).toEqual([]);
      const grande = await invia(new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'application/pdf' }), 'grande.pdf');
      expect(grande.stato).toBe(413);
      expect(await prisma.pagamento.count({ where: { importoPagato: 250.25 } })).toBe(0);
      // Nemmeno il file troppo grande resta a metà sul disco.
      expect(readdirSync('uploads/ricevute').filter((f) => statSync(join('uploads/ricevute', f)).mtimeMs > inizio)).toEqual([]);
    });
  });

  describe('limiti alle risposte', () => {
    it('l\'elenco delle scadenze richiede mese e anno', async () => {
      expect((await richiesta('GET', '/scadenze')).stato).toBe(400);
      expect((await richiesta('GET', '/scadenze?meseScadenza=13&annoScadenza=2026')).stato).toBe(400);
      const marzo = await richiesta('GET', '/scadenze?meseScadenza=3&annoScadenza=2026');
      expect(marzo.stato).toBe(200);
      expect(marzo.json).toHaveLength(1);
    });

    it('la dimensione della pagina ha un massimo, e valori non validi non causano errori', async () => {
      const grande = await richiesta('GET', '/scadenze/paginated?pageSize=1000000');
      expect(grande.json.pagination.pageSize).toBe(200);
      const invalida = await richiesta('GET', '/veicoli/paginated?page=abc&pageSize=-3');
      expect(invalida.stato).toBe(200);
      expect(invalida.json.pagination).toEqual(expect.objectContaining({ page: 1, pageSize: 50 }));
    });
  });

  describe('tariffe', () => {
    async function configurazioneConTariffa() {
      const config = await prisma.configurazioneBollo.create({
        data: { annoValidita: 2026, validoDa: d(2026, 1), validoA: d(2026, 12, 31), regione: 'Lombardia' },
      });
      const tariffa = await prisma.tariffaBollo.create({
        data: { idConfigurazione: config.id, tipoVeicolo: 'Autovettura', categoriaEuro: 'Euro 4', unitaMisura: 'KW', importoUnitario: 2.58 },
      });
      return { config, tariffa };
    }

    it('ogni modifica di una tariffa resta nel registro, con il valore prima e dopo', async () => {
      const { tariffa } = await configurazioneConTariffa();

      const risposta = await richiesta('POST', `/bollo/tariffe/${tariffa.id}`, { corpo: { importoUnitario: 2.7 } });
      expect(risposta.stato).toBe(201);

      const voci = await prisma.auditLog.findMany({ where: { entita: 'tariffa', idEntita: tariffa.id } });
      expect(voci).toHaveLength(1);
      expect(voci[0]).toEqual(
        expect.objectContaining({
          azione: 'MODIFICA',
          utente: 'admin@studio.it',
          datiPrima: expect.objectContaining({ importoUnitario: '2.58', tipoVeicolo: 'Autovettura' }),
          datiDopo: expect.objectContaining({ importoUnitario: '2.7' }),
        }),
      );
      expect((await richiesta('POST', '/bollo/tariffe/999999', { corpo: { importoUnitario: 1 } })).stato).toBe(404);

      // L'importo fisso si toglie con null; omesso resta com'è.
      await richiesta('POST', `/bollo/tariffe/${tariffa.id}`, { corpo: { importoFisso: 12.5 } });
      await richiesta('POST', `/bollo/tariffe/${tariffa.id}`, { corpo: { importoUnitario: 2.8 } });
      expect((await prisma.tariffaBollo.findUnique({ where: { id: tariffa.id } }))!.importoFisso?.toString()).toBe('12.5');
      expect((await richiesta('POST', `/bollo/tariffe/${tariffa.id}`, { corpo: { importoFisso: null } })).stato).toBe(201);
      expect((await prisma.tariffaBollo.findUnique({ where: { id: tariffa.id } }))!.importoFisso).toBeNull();
      expect((await richiesta('POST', `/bollo/tariffe/${tariffa.id}`, { corpo: { importoUnitario: -1 } })).stato).toBe(400);
    });

    it('nuove configurazioni (anche duplicate) e nuove tariffe restano nel registro', async () => {
      const { config } = await configurazioneConTariffa();

      const duplicata = await richiesta('POST', `/bollo/configurazioni/${config.id}/duplica`, { corpo: { nuovoAnno: 2027 } });
      expect(duplicata.stato).toBe(201);
      expect(duplicata.json.tariffe).toHaveLength(1);
      const nuova = await richiesta('POST', '/bollo/configurazioni', { corpo: { annoValidita: 2026, regione: 'Piemonte' } });
      expect(nuova.stato).toBe(201);
      const tariffa = await richiesta('POST', `/bollo/configurazioni/${nuova.json.id}/tariffe`, {
        corpo: { tipoVeicolo: 'Motociclo', unitaMisura: 'FISSO', importoUnitario: 0, importoFisso: 20.5 },
      });
      expect(tariffa.stato).toBe(201);

      const voci = await prisma.auditLog.findMany({ where: { azione: 'CREAZIONE' }, orderBy: { id: 'asc' } });
      expect(voci.map((v) => [v.entita, v.utente])).toEqual([
        ['configurazione', 'admin@studio.it'],
        ['configurazione', 'admin@studio.it'],
        ['tariffa', 'admin@studio.it'],
      ]);
      expect(voci[0].note).toContain('Duplicata');
      expect(voci[2].datiDopo).toEqual(expect.objectContaining({ importoFisso: '20.5', tipoVeicolo: 'Motociclo' }));
    });

    it('un operatore consulta le tariffe ma non può modificarle', async () => {
      const { config, tariffa } = await configurazioneConTariffa();
      await prisma.utente.create({
        data: { email: 'operatore@studio.it', password: await bcrypt.hash(PASSWORD, 4), ruolo: 'OPERATORE' },
      });
      token = (await richiesta('POST', '/auth/login', { corpo: { email: 'operatore@studio.it', password: PASSWORD } })).json
        .access_token;

      expect((await richiesta('GET', `/bollo/configurazioni/${config.id}/tariffe`)).stato).toBe(200);
      expect((await richiesta('POST', `/bollo/tariffe/${tariffa.id}`, { corpo: { importoUnitario: 9 } })).stato).toBe(403);
      expect((await prisma.tariffaBollo.findUnique({ where: { id: tariffa.id } }))!.importoUnitario.toString()).toBe('2.58');
      expect(await prisma.auditLog.count({ where: { entita: 'tariffa' } })).toBe(0);
    });
  });

  describe('report', () => {
    it('scadenze in Excel: righe del periodo, importi numerici, totale e importi mancanti dichiarati', async () => {
      const r = await richiesta('GET', '/report/scadenze?formato=xlsx&da=2024-01&a=2027-12');

      expect(r.stato).toBe(200);
      expect(r.intestazioni.get('content-type')).toContain('spreadsheetml');
      expect(r.intestazioni.get('content-disposition')).toMatch(/attachment; filename="report-scadenze-\d{4}-\d{2}-\d{2}\.xlsx"/);
      expect(r.intestazioni.get('cache-control')).toBe('no-store');

      const { righe } = await leggiExcel(r.buffer);
      expect(righe[0]).toEqual(['Scadenza', 'Cliente', 'Targa', 'Tipo veicolo', 'Periodicità', 'Importo previsto', 'Stato']);
      const dati = righe.slice(1, 6);
      expect(dati.map((x) => [x[1], x[2], x[5], x[6]])).toEqual([
        ['Rossi Mario', 'AB123CD', 90, 'Pagato'],
        ['Rossi Mario', 'AB123CD', 100.5, 'Scaduto'],
        ['Rossi Mario', 'AB123CD', 110, 'Da pagare'],
        ['Trasporti Alfa SRL', 'XY987ZW', 250.25, 'Da pagare'],
        ['Rossi Mario', 'AB123CD', undefined, 'Da pagare'],
      ]);
      expect(dati[0][0]).toEqual(d(2024, 3));
      const testo = righe.map((x) => x.join(' ')).join('\n');
      expect(testo).toContain('Righe: 5');
      expect(testo).toMatch(/Importo previsto totale: 550,75/);
      expect(testo).toContain('Senza importo (non sommate): 1');
      expect(testo).toContain('Periodo: da gennaio 2024 a dicembre 2027');
    });

    it('filtri per stato e cliente', async () => {
      const r = await richiesta('GET', `/report/scadenze?formato=xlsx&da=2024-01&a=2027-12&stato=DA_PAGARE&idCliente=${ids.rossi}`);
      const { righe } = await leggiExcel(r.buffer);
      const targhe = righe.slice(1).filter((x) => x[2] === 'AB123CD' || x[2] === 'XY987ZW');
      expect(targhe).toHaveLength(2);
      expect(righe.map((x) => x.join(' ')).join('\n')).toContain('Cliente: Rossi Mario');
    });

    it('scadenze in PDF, e oltre il limite di righe un errore chiaro invece di un documento enorme', async () => {
      const pdf = await richiesta('GET', '/report/scadenze?formato=pdf&da=2024-01&a=2027-12');
      expect(pdf.stato).toBe(200);
      expect(pdf.intestazioni.get('content-type')).toBe('application/pdf');
      expect(pdf.buffer.subarray(0, 5).toString()).toBe('%PDF-');

      await prisma.scadenza.createMany({
        data: Array.from({ length: 3001 }, () => ({
          idVeicolo: ids.ab,
          dataScadenza: d(2030, 1),
          meseScadenza: 1,
          annoScadenza: 2030,
          importoPrevisto: 1,
        })),
      });
      const troppe = await richiesta('GET', '/report/scadenze?formato=pdf&da=2030-01&a=2030-01');
      expect(troppe.stato).toBe(422);
      expect(troppe.json.message).toMatch(/3\.001 righe: il PDF è limitato a 3\.000.*Excel/);

      // Lo stesso volume in Excel si genera, a blocchi.
      const excel = await richiesta('GET', '/report/scadenze?formato=xlsx&da=2030-01&a=2030-01');
      expect(excel.stato).toBe(200);
      const { righe } = await leggiExcel(excel.buffer);
      expect(righe.map((x) => x.join(' ')).join('\n')).toContain('Righe: 3.001');
    });

    it('pagamenti per periodo', async () => {
      const r = await richiesta('GET', '/report/pagamenti?formato=xlsx&dal=2024-03-01&al=2024-03-31');
      const { righe } = await leggiExcel(r.buffer);
      expect(righe[1].slice(1)).toEqual(['Rossi Mario', 'AB123CD', d(2024, 3), 90, 'Bonifico']);

      const fuori = await richiesta('GET', '/report/pagamenti?formato=xlsx&dal=2025-01-01');
      expect((await leggiExcel(fuori.buffer)).righe.map((x) => x.join(' ')).join('\n')).toContain('Righe: 0');

      const pdf = await richiesta('GET', '/report/pagamenti?formato=pdf');
      expect(pdf.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('clienti attivi in ordine alfabetico, con i veicoli attivi', async () => {
      const r = await richiesta('GET', '/report/clienti?formato=xlsx');
      const { righe } = await leggiExcel(r.buffer);
      expect(righe.slice(1, 3).map((x) => [x[0], x[5]])).toEqual([
        ['Rossi Mario', 1],
        ['Trasporti Alfa SRL', 1],
      ]);
      expect(righe.map((x) => x.join(' ')).join('\n')).not.toContain('Cessata');
    });

    it('parametri non validi: 400; senza login: 401', async () => {
      expect((await richiesta('GET', '/report/scadenze?formato=csv')).stato).toBe(400);
      expect((await richiesta('GET', '/report/scadenze?formato=xlsx&da=2026-13')).stato).toBe(400);
      expect((await richiesta('GET', '/report/scadenze?formato=xlsx&da=2026-05&a=2026-01')).stato).toBe(400);
      expect((await richiesta('GET', '/report/pagamenti?formato=xlsx&dal=2026-02-31')).stato).toBe(400);
      expect((await richiesta('GET', '/report/clienti?formato=xlsx', { senzaToken: true })).stato).toBe(401);
    });

    it('ogni esportazione resta nel registro: chi, cosa, quante righe', async () => {
      await richiesta('GET', '/report/scadenze?formato=xlsx&da=2024-01&a=2027-12&stato=SCADUTO');

      const voci = await prisma.auditLog.findMany({ where: { entita: 'report' } });
      expect(voci).toHaveLength(1);
      expect(voci[0]).toEqual(
        expect.objectContaining({
          azione: 'ESPORTAZIONE',
          utente: 'admin@studio.it',
          datiDopo: expect.objectContaining({ tipo: 'scadenze', formato: 'xlsx', righe: 1 }),
        }),
      );
    });
  });
});
