import { closeSync, openSync, readSync } from 'fs';

/**
 * Verifica che il contenuto di un file corrisponda alla sua estensione,
 * leggendone i primi byte ("firma").
 *
 * Il tipo dichiarato dal browser (Content-Type) e l'estensione li sceglie chi
 * carica il file: senza questo controllo un file qualsiasi (una pagina HTML,
 * un eseguibile) poteva essere salvato come "ricevuta.pdf".
 */
const FIRME: Record<string, ((b: Buffer) => boolean)[]> = {
  '.pdf': [(b) => b.subarray(0, 5).toString('latin1') === '%PDF-'],
  '.jpg': [(b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  '.jpeg': [(b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  '.png': [(b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  '.gif': [(b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1'))],
  '.webp': [(b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'],
  '.tif': [(b) => b.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])), (b) => b.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))],
  '.tiff': [(b) => b.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])), (b) => b.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))],
};

export function contenutoCoerente(inizio: Buffer, estensione: string): boolean {
  return (FIRME[estensione.toLowerCase()] ?? []).some((firma) => firma(inizio));
}

/** Primi 12 byte di un file su disco. */
export function leggiInizio(percorso: string): Buffer {
  const fd = openSync(percorso, 'r');
  try {
    const buffer = Buffer.alloc(12);
    const letti = readSync(fd, buffer, 0, 12, 0);
    return buffer.subarray(0, letti);
  } finally {
    closeSync(fd);
  }
}
