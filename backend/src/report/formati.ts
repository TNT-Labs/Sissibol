import type { Writable } from 'stream';
import * as ExcelJS from 'exceljs';
import PDFDocument = require('pdfkit');

/**
 * Scrittura dei report in Excel e PDF, a partire da una definizione comune
 * (colonne + righe lette a blocchi dal database).
 *
 * Prima i report erano costruiti nel browser: tutte le righe scaricate in
 * memoria (con veicolo e cliente) e il file generato lì. Con l'archivio reale
 * (124.568 scadenze) il browser si bloccava. Qui le righe arrivano a blocchi
 * e l'Excel viene scritto in streaming: la memoria usata non dipende dal
 * numero di righe.
 */

export type TipoColonna = 'testo' | 'euro' | 'data' | 'mese';

export interface Colonna<R> {
  titolo: string;
  valore: (riga: R) => string | number | Date | null | undefined;
  tipo?: TipoColonna;
  /** Larghezza in Excel (caratteri). */
  larghezza: number;
  /** Peso relativo della colonna nel PDF; assente = colonna solo in Excel. */
  pdf?: number;
  /** Colonna euro da sommare nel riepilogo. */
  totale?: boolean;
}

export interface DefinizioneReport<R> {
  titolo: string;
  foglio: string;
  /** Righe descrittive dei filtri applicati. */
  filtri: string[];
  colonne: Colonna<R>[];
  righe: AsyncIterable<R>;
}

export interface Riepilogo {
  righe: number;
  /** Somma della colonna con `totale`, in centesimi per evitare errori di arrotondamento. */
  totaleCentesimi: number;
  /** Righe senza importo nella colonna con `totale`: non sommate, ma dichiarate. */
  senzaImporto: number;
}

// Separatore delle migliaia sempre: con le impostazioni italiane Intl lo
// omette sotto le 5 cifre ("3000" accanto a "60.000").
// ('always' è standard ma non ancora nei tipi di TypeScript.)
const SEMPRE = 'always' as unknown as boolean;
const EURO = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: SEMPRE });
const NUMERO = new Intl.NumberFormat('it-IT', { useGrouping: SEMPRE });
const DATA = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const GENERATO = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
});
const MESE = new Intl.DateTimeFormat('it-IT', { month: '2-digit', year: 'numeric', timeZone: 'UTC' });

export const formattaEuro = (valore: number) => EURO.format(valore);
export const formattaNumero = (valore: number) => NUMERO.format(valore);

function comeNumero(valore: unknown): number | null {
  if (valore === null || valore === undefined || valore === '') return null;
  const n = Number(valore);
  return Number.isFinite(n) ? n : null;
}

function testoCella(tipo: TipoColonna | undefined, valore: unknown): string {
  if (valore === null || valore === undefined || valore === '') return '—';
  if (tipo === 'euro') {
    const n = comeNumero(valore);
    return n === null ? '—' : EURO.format(n);
  }
  if (tipo === 'data' && valore instanceof Date) return DATA.format(valore);
  if (tipo === 'mese' && valore instanceof Date) return MESE.format(valore);
  return String(valore);
}

function aggiornaRiepilogo<R>(riepilogo: Riepilogo, colonne: Colonna<R>[], riga: R) {
  riepilogo.righe++;
  const colonna = colonne.find((c) => c.totale);
  if (!colonna) return;
  const n = comeNumero(colonna.valore(riga));
  if (n === null) riepilogo.senzaImporto++;
  else riepilogo.totaleCentesimi += Math.round(n * 100);
}

export function righeRiepilogo<R>(def: DefinizioneReport<R>, riepilogo: Riepilogo): string[] {
  const righe = [`Righe: ${NUMERO.format(riepilogo.righe)}`];
  const colonna = def.colonne.find((c) => c.totale);
  if (colonna) {
    righe.push(`${colonna.titolo} totale: ${EURO.format(riepilogo.totaleCentesimi / 100)}`);
    if (riepilogo.senzaImporto > 0) {
      righe.push(`Senza importo (non sommate): ${NUMERO.format(riepilogo.senzaImporto)}`);
    }
  }
  return righe;
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

const FORMATO_EXCEL: Record<TipoColonna, string | undefined> = {
  testo: undefined,
  euro: '#,##0.00 [$€-410]',
  data: 'dd/mm/yyyy',
  mese: 'mm/yyyy',
};

export async function scriviExcel<R>(def: DefinizioneReport<R>, destinazione: Writable): Promise<Riepilogo> {
  const libro = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: destinazione,
    useStyles: true,
    useSharedStrings: false,
  });
  libro.creator = 'Sissibol';
  libro.created = new Date();

  const foglio = libro.addWorksheet(def.foglio, { views: [{ state: 'frozen', ySplit: 1 }] });
  foglio.columns = def.colonne.map((c, i) => ({
    header: c.titolo,
    key: `c${i}`,
    width: c.larghezza,
    style: FORMATO_EXCEL[c.tipo ?? 'testo'] ? { numFmt: FORMATO_EXCEL[c.tipo ?? 'testo'] } : {},
  }));
  const intestazione = foglio.getRow(1);
  intestazione.font = { bold: true };
  intestazione.commit();

  const riepilogo: Riepilogo = { righe: 0, totaleCentesimi: 0, senzaImporto: 0 };
  for await (const riga of def.righe) {
    const valori: Record<string, unknown> = {};
    def.colonne.forEach((c, i) => {
      const v = c.valore(riga);
      // Gli importi sono numeri veri (sommabili in Excel); le celle vuote restano vuote.
      valori[`c${i}`] = c.tipo === 'euro' ? comeNumero(v) : (v ?? null);
    });
    foglio.addRow(valori).commit();
    aggiornaRiepilogo(riepilogo, def.colonne, riga);
  }

  // Riepilogo e filtri in fondo, dopo una riga vuota.
  foglio.addRow([]).commit();
  const iTotale = def.colonne.findIndex((c) => c.totale);
  for (const [i, testo] of righeRiepilogo(def, riepilogo).entries()) {
    const riga = foglio.addRow([testo]);
    if (i === 1 && iTotale >= 0) riga.getCell(iTotale + 1).value = riepilogo.totaleCentesimi / 100;
    riga.font = { bold: true };
    riga.commit();
  }
  for (const filtro of def.filtri) foglio.addRow([filtro]).commit();

  foglio.commit();
  await libro.commit();
  return riepilogo;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

const MARGINE = 40;
const ALTEZZA_RIGA = 15;
const CORPO = 8.5;
const BLU = '#1d4ed8';

/** Tronca il testo alla larghezza disponibile, con i puntini. */
function adatta(doc: PDFKit.PDFDocument, testo: string, larghezza: number): string {
  if (doc.widthOfString(testo) <= larghezza) return testo;
  let fine = testo.length;
  while (fine > 0 && doc.widthOfString(`${testo.slice(0, fine)}…`) > larghezza) fine--;
  return `${testo.slice(0, fine)}…`;
}

export async function scriviPdf<R>(def: DefinizioneReport<R>, destinazione: Writable): Promise<Riepilogo> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGINE,
    bufferPages: true, // per numerare le pagine alla fine ("Pagina 2 di 7")
    info: { Title: def.titolo, Creator: 'Sissibol' },
  });
  const finito = new Promise<void>((resolve, reject) => {
    destinazione.on('finish', resolve);
    destinazione.on('error', reject);
    doc.on('error', reject);
  });
  doc.pipe(destinazione);

  const colonne = def.colonne.filter((c) => c.pdf);
  const larghezzaUtile = doc.page.width - MARGINE * 2;
  const pesoTotale = colonne.reduce((s, c) => s + (c.pdf ?? 0), 0);
  const larghezze = colonne.map((c) => ((c.pdf ?? 0) / pesoTotale) * larghezzaUtile);
  const fondo = () => doc.page.height - MARGINE - 20;

  // Intestazione del documento
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#111827').text(def.titolo);
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(9).fillColor('#4b5563');
  doc.text(`Generato il ${GENERATO.format(new Date()).replace(',', ' alle')}`);
  for (const filtro of def.filtri) doc.text(filtro);
  doc.moveDown(0.8);

  let y = doc.y;
  const intestazioneTabella = () => {
    doc.rect(MARGINE, y, larghezzaUtile, ALTEZZA_RIGA + 2).fill(BLU);
    doc.font('Helvetica-Bold').fontSize(CORPO).fillColor('#ffffff');
    let x = MARGINE;
    colonne.forEach((c, i) => {
      const allinea = c.tipo === 'euro' ? 'right' : 'left';
      doc.text(adatta(doc, c.titolo, larghezze[i] - 8), x + 4, y + 4.5, { width: larghezze[i] - 8, align: allinea, lineBreak: false });
      x += larghezze[i];
    });
    y += ALTEZZA_RIGA + 2;
    doc.font('Helvetica').fillColor('#111827');
  };
  intestazioneTabella();

  const riepilogo: Riepilogo = { righe: 0, totaleCentesimi: 0, senzaImporto: 0 };
  for await (const riga of def.righe) {
    if (y + ALTEZZA_RIGA > fondo()) {
      doc.addPage();
      y = MARGINE;
      intestazioneTabella();
    }
    if (riepilogo.righe % 2 === 1) doc.rect(MARGINE, y, larghezzaUtile, ALTEZZA_RIGA).fill('#f3f4f6');
    doc.fillColor('#111827').font('Helvetica').fontSize(CORPO);
    let x = MARGINE;
    colonne.forEach((c, i) => {
      const testo = adatta(doc, testoCella(c.tipo, c.valore(riga)), larghezze[i] - 8);
      doc.text(testo, x + 4, y + 4, { width: larghezze[i] - 8, align: c.tipo === 'euro' ? 'right' : 'left', lineBreak: false });
      x += larghezze[i];
    });
    y += ALTEZZA_RIGA;
    aggiornaRiepilogo(riepilogo, def.colonne, riga);
  }

  // Riepilogo
  if (y + 60 > fondo()) {
    doc.addPage();
    y = MARGINE;
  }
  doc.moveTo(MARGINE, y + 4).lineTo(MARGINE + larghezzaUtile, y + 4).strokeColor('#9ca3af').stroke();
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827');
  let yRiepilogo = y + 12;
  for (const testo of righeRiepilogo(def, riepilogo)) {
    doc.text(testo, MARGINE, yRiepilogo, { lineBreak: false });
    yRiepilogo += 14;
  }

  // Numeri di pagina, nel margine inferiore.
  const pagine = doc.bufferedPageRange();
  for (let i = 0; i < pagine.count; i++) {
    doc.switchToPage(pagine.start + i);
    const margineBasso = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // altrimenti scrivere nel margine aggiunge una pagina
    doc.font('Helvetica').fontSize(8).fillColor('#6b7280');
    doc.text(`Pagina ${i + 1} di ${pagine.count}`, MARGINE, doc.page.height - MARGINE + 10, {
      width: larghezzaUtile,
      align: 'right',
      lineBreak: false,
    });
    doc.page.margins.bottom = margineBasso;
  }

  doc.end();
  await finito;
  return riepilogo;
}
