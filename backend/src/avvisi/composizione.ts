/**
 * Composizione dell'email di avviso al cliente.
 *
 * Funzioni pure: nessun accesso al database né al server di posta. Il testo
 * composto qui è anche quello che viene salvato sull'avviso come prova del
 * contenuto inviato.
 *
 * Un'email per cliente, non per veicolo: lo studio ha clienti con decine di
 * mezzi, e un messaggio per targa sarebbe rumore che finisce ignorato.
 */

export type TipoVoce = 'PRIMO' | 'SECONDO' | 'SOLLECITO';

/** Un veicolo in scadenza dentro l'email. */
export interface VoceAvviso {
  targa: string;
  dataScadenza: Date;
  /** Decimal di Prisma, numero o stringa; null se l'importo non è noto */
  importoPrevisto: { toString(): string } | number | string | null;
  tipo: TipoVoce;
}

export interface DatiAvviso {
  nomeCliente: string;
  voci: VoceAvviso[];
  /** Firma dello studio, anche su più righe */
  firma: string;
}

export interface EmailComposta {
  oggetto: string;
  testo: string;
  html: string;
}

const FORMATO_EURO = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
});

/** Nome con cui rivolgersi al cliente. */
export function nomeCliente(cliente: {
  ragioneSociale?: string | null;
  nome?: string | null;
  cognome?: string | null;
}): string {
  return (
    cliente.ragioneSociale?.trim() ||
    [cliente.nome, cliente.cognome].filter(Boolean).join(' ').trim() ||
    'Cliente'
  );
}

export function escapeHtml(valore: string): string {
  return valore
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Data di una colonna DATE (mezzanotte UTC) nel formato gg/mm/aaaa. */
export function formattaData(data: Date): string {
  const gg = String(data.getUTCDate()).padStart(2, '0');
  const mm = String(data.getUTCMonth() + 1).padStart(2, '0');
  return `${gg}/${mm}/${data.getUTCFullYear()}`;
}

/** Importo in euro, o null se mancante o non valido. */
export function formattaImporto(importo: VoceAvviso['importoPrevisto']): string | null {
  if (importo === null || importo === undefined) return null;
  const valore = Number(importo.toString());
  return Number.isFinite(valore) ? FORMATO_EURO.format(valore) : null;
}

function ordinaVoci(voci: VoceAvviso[]): VoceAvviso[] {
  return [...voci].sort(
    (a, b) =>
      a.dataScadenza.getTime() - b.dataScadenza.getTime() || a.targa.localeCompare(b.targa),
  );
}

export function componiAvviso(dati: DatiAvviso): EmailComposta {
  if (dati.voci.length === 0) {
    throw new Error('Un avviso deve riguardare almeno un veicolo');
  }

  const voci = ordinaVoci(dati.voci);
  // Il chiamante indica SECONDO solo se il cliente ha davvero ricevuto il primo.
  const secondo = voci.some((v) => v.tipo !== 'PRIMO');
  const unoSolo = voci.length === 1;
  const nome = dati.nomeCliente.trim() || 'Cliente';

  const righe = voci.map((v) => {
    const importo = formattaImporto(v.importoPrevisto);
    return {
      targa: v.targa,
      scadenza: formattaData(v.dataScadenza),
      importo: importo ? `importo previsto ${importo}` : 'importo da definire',
      importoCella: importo ?? 'da definire',
    };
  });

  const oggetto =
    (secondo ? 'Secondo avviso: scadenza' : 'Scadenza') +
    (unoSolo
      ? ` bollo veicolo ${righe[0].targa} il ${righe[0].scadenza}`
      : ` bollo di ${voci.length} veicoli`);

  const introduzione = unoSolo
    ? 'le ricordiamo che è in scadenza la tassa automobilistica (bollo) del veicolo:'
    : 'le ricordiamo che è in scadenza la tassa automobilistica (bollo) dei seguenti veicoli:';

  const note: string[] = [];
  if (secondo) note.push('Questo è un secondo promemoria.');
  note.push('Se ha già provveduto, non tenga conto di questo messaggio.');
  if (righe.some((r) => r.importo === 'importo da definire')) {
    note.push('Gli importi da definire le saranno comunicati dallo studio.');
  }
  note.push('Per qualsiasi informazione può rispondere a questa email.');

  const firma = dati.firma.trim();

  const testo = [
    `Gentile ${nome},`,
    '',
    introduzione,
    '',
    ...righe.map((r) => `  - ${r.targa}: scadenza ${r.scadenza}, ${r.importo}`),
    '',
    ...note,
    '',
    'Cordiali saluti',
    ...(firma ? [firma] : []),
  ].join('\n');

  const cella = 'padding:6px 10px;border:1px solid #d1d5db;text-align:left';
  const html = `<!DOCTYPE html>
<html lang="it"><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.5">
<p>Gentile ${escapeHtml(nome)},</p>
<p>${escapeHtml(introduzione)}</p>
<table style="border-collapse:collapse;margin:8px 0 16px">
<tr><th style="${cella}">Targa</th><th style="${cella}">Scadenza</th><th style="${cella}">Importo previsto</th></tr>
${righe
  .map(
    (r) =>
      `<tr><td style="${cella}">${escapeHtml(r.targa)}</td><td style="${cella}">${escapeHtml(r.scadenza)}</td><td style="${cella}">${escapeHtml(r.importoCella)}</td></tr>`,
  )
  .join('\n')}
</table>
${note.map((n) => `<p style="margin:4px 0">${escapeHtml(n)}</p>`).join('\n')}
<p style="margin-top:16px">Cordiali saluti${firma ? `<br>${escapeHtml(firma).replace(/\n/g, '<br>')}` : ''}</p>
</body></html>`;

  return { oggetto, testo, html };
}
