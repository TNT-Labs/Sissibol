/**
 * Motore di calcolo del bollo: API pubblica.
 *
 * Modulo puro, senza dipendenze da database, framework o orologio: riceve
 * veicolo, tariffario e contesto come dati e restituisce un risultato.
 * Un test verifica che nessun file di questa cartella importi Prisma o NestJS.
 */
export { calcolaBollo, risultatoNonCalcolabile } from './calcola';
export { VERSIONE_MOTORE } from './versione';
export { REGOLE, CATEGORIA_AUTOVETTURE, CATEGORIA_MOTOCICLI, etichetta, datoMancante } from './regole';
export { valutaEsenzioni, POLITICA_CUMULO, TESTO_ASSUNZIONE } from './esenzioni';
export * from './tipi';
