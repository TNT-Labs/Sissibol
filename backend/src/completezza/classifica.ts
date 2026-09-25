import { etichetta, MotivoNonCalcolabile, TESTO_ASSUNZIONE } from '../bollo/motore';
import { DOVE_TROVARLO, MOTIVI_TARIFFARIO } from './dove-trovarlo';

export interface CampoDaCompletare {
  campo: string;
  etichetta: string;
  doveTrovarlo: string | null;
  /** Perché va completato: mancante, non valido o tipo da riclassificare */
  motivo: 'MANCANTE' | 'NON_VALIDO' | 'DA_RICLASSIFICARE';
  messaggio: string;
}

export interface Classificazione {
  /** Dati indispensabili al calcolo */
  mancanti: CampoDaCompletare[];
  /** Dati che servono a valutare esenzioni e riduzioni */
  consigliati: CampoDaCompletare[];
  /** Problemi del tariffario: non si risolvono sul veicolo */
  tariffario: string[];
}

function campo(nome: string, motivo: CampoDaCompletare['motivo'], messaggio: string): CampoDaCompletare {
  return {
    campo: nome,
    etichetta: etichetta(nome),
    doveTrovarlo: DOVE_TROVARLO[nome] ?? null,
    motivo,
    messaggio,
  };
}

const MOTIVO_PER_CODICE: Record<string, CampoDaCompletare['motivo']> = {
  DATO_MANCANTE: 'MANCANTE',
  DATO_NON_VALIDO: 'NON_VALIDO',
  TIPO_NON_GESTITO: 'DA_RICLASSIFICARE',
};

/**
 * Separa i motivi del motore in ciò che si completa sul veicolo e ciò che si
 * corregge nel tariffario.
 *
 * Non esiste un elenco dei campi richiesti per tipo: è il motore a dirlo. Un
 * elenco parallelo divergerebbe alla prima modifica delle regole. Il motore
 * riporta un blocco alla volta (un autocarro senza peso non dice ancora se
 * gli servono gli assi): dopo ogni completamento il veicolo va rivalutato.
 */
export function classificaValutazione(risultato: {
  motivi: MotivoNonCalcolabile[];
  assunzioni: string[];
}): Classificazione {
  const mancanti: CampoDaCompletare[] = [];
  const tariffario: string[] = [];

  for (const m of risultato.motivi) {
    if (MOTIVI_TARIFFARIO.has(m.codice)) {
      tariffario.push(m.messaggio);
      continue;
    }
    if (m.campo && !mancanti.some((c) => c.campo === m.campo)) {
      mancanti.push(campo(m.campo, MOTIVO_PER_CODICE[m.codice] ?? 'MANCANTE', m.messaggio));
    }
  }

  const consigliati = (Object.keys(TESTO_ASSUNZIONE) as Array<keyof typeof TESTO_ASSUNZIONE>)
    .filter((c) => risultato.assunzioni.includes(TESTO_ASSUNZIONE[c]))
    .map((c) => campo(c, 'MANCANTE', TESTO_ASSUNZIONE[c]));

  return { mancanti, consigliati, tariffario };
}
