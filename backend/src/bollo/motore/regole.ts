/**
 * Regole di calcolo per famiglia di veicoli.
 *
 * Ogni regola riceve il veicolo e le sole righe del tariffario del suo tipo,
 * e restituisce un importo oppure i motivi per cui non può calcolarlo.
 * Principio comune: una regola non assume mai un dato mancante e non applica
 * mai una tariffa se il veicolo non rientra nella sua fascia. In entrambi i
 * casi dichiara il motivo invece di produrre un numero.
 */

import {
  ContestoCalcolo,
  MotivoNonCalcolabile,
  TariffaInput,
  VeicoloInput,
  VoceApplicata,
} from './tipi';
import {
  Dec,
  Estremi,
  ZERO,
  dec,
  descriviFascia,
  euro,
  fasciaDi,
  inFascia,
  primaSovrapposizione,
  quantita,
} from './numeri';

export interface EsitoRegola {
  /** Importo lordo non arrotondato; null se ci sono motivi */
  importo: Dec | null;
  voci: VoceApplicata[];
  dettaglio: string[];
  motivi: MotivoNonCalcolabile[];
}

export type Regola = (
  veicolo: VeicoloInput,
  righe: TariffaInput[],
  contesto: ContestoCalcolo,
) => EsitoRegola;

// =====================================================
// CLASSI AMBIENTALI -> CATEGORIE TARIFFARIE
// =====================================================

/** Il tariffario raggruppa le classi recenti in un'unica categoria. */
export const CATEGORIA_AUTOVETTURE: Record<string, string> = {
  'Euro 0': 'Euro 0',
  'Euro 1': 'Euro 1',
  'Euro 2': 'Euro 2',
  'Euro 3': 'Euro 3',
  'Euro 4': 'Euro 4-5-6',
  'Euro 5': 'Euro 4-5-6',
  'Euro 5a': 'Euro 4-5-6',
  'Euro 5b': 'Euro 4-5-6',
  'Euro 6': 'Euro 4-5-6',
  'Euro 6a': 'Euro 4-5-6',
  'Euro 6b': 'Euro 4-5-6',
  'Euro 6c': 'Euro 4-5-6',
  'Euro 6d-TEMP': 'Euro 4-5-6',
  'Euro 6d': 'Euro 4-5-6',
  'Euro 6d-ISC': 'Euro 4-5-6',
  'Euro 6d-ISC-FCM': 'Euro 4-5-6',
  'Euro 6e': 'Euro 4-5-6',
  'Euro 7': 'Euro 4-5-6',
};

/**
 * Per i motocicli la categoria più recente è "Euro 3 e successivi": tutte le
 * classi dalla 3 in poi vi ricadono per definizione.
 */
export const CATEGORIA_MOTOCICLI: Record<string, string> = Object.fromEntries(
  Object.keys(CATEGORIA_AUTOVETTURE).map((classe) => [
    classe,
    ['Euro 0', 'Euro 1', 'Euro 2'].includes(classe) ? classe : 'Euro 3 e successivi',
  ]),
);

// =====================================================
// DATI RICHIESTI
// =====================================================

const ETICHETTE: Record<string, string> = {
  tipoVeicolo: 'tipo di veicolo',
  potenzaKw: 'potenza (KW)',
  classeAmbientale: 'classe ambientale',
  cilindrata: 'cilindrata',
  portataKg: 'portata',
  pesoComplessivoKg: 'peso complessivo',
  numeroAssi: 'numero di assi',
  tipoSospensione: 'tipo di sospensioni',
  numeroPosti: 'numero di posti',
  massaRimorchiabileKg: 'massa rimorchiabile',
  dataImmatricolazione: 'data di immatricolazione',
  alimentazione: 'alimentazione',
  regione: 'regione',
};

export function etichetta(campo: string): string {
  return ETICHETTE[campo] ?? campo;
}

export function datoMancante(campo: string): MotivoNonCalcolabile {
  return {
    codice: 'DATO_MANCANTE',
    campo,
    messaggio: `Dato mancante: ${etichetta(campo)}.`,
  };
}

/** Motivi per i campi richiesti non valorizzati, tutti insieme. */
function richiedi(veicolo: VeicoloInput, campi: Array<keyof VeicoloInput>): MotivoNonCalcolabile[] {
  return campi
    .filter((campo) => veicolo[campo] === null || veicolo[campo] === undefined)
    .map((campo) => datoMancante(campo));
}

function nonCalcolabile(motivi: MotivoNonCalcolabile[]): EsitoRegola {
  return { importo: null, voci: [], dettaglio: [], motivi };
}

// =====================================================
// SELEZIONE DELLE RIGHE DEL TARIFFARIO
// =====================================================

interface Filtro {
  unita: string;
  categoriaEuro?: string;
  tipoSospensione?: string;
}

/**
 * Righe del tariffario per unità di misura (ed eventualmente categoria o
 * sospensione) nella periodicità richiesta.
 *
 * Distingue due casi che il motore precedente confondeva:
 * - nessuna riga in assoluto: il tariffario non copre il caso;
 * - righe solo per l'altra periodicità: in particolare il quadrimestrale
 *   veniva calcolato con l'importo ANNUALE, cioè addebitando il triplo.
 */
function righePer(
  righe: TariffaInput[],
  filtro: Filtro,
  contesto: ContestoCalcolo,
  cosa: string,
): { righe: TariffaInput[] } | { motivo: MotivoNonCalcolabile } {
  const pertinenti = righe.filter(
    (t) =>
      t.unitaMisura === filtro.unita &&
      (filtro.categoriaEuro === undefined || t.categoriaEuro === filtro.categoriaEuro) &&
      (filtro.tipoSospensione === undefined || t.tipoSospensione === filtro.tipoSospensione),
  );

  if (pertinenti.length === 0) {
    return {
      motivo: {
        codice: 'TARIFFA_MANCANTE',
        messaggio: `Il tariffario non contiene tariffe per ${cosa}.`,
      },
    };
  }

  const delPeriodo = pertinenti.filter((t) => t.periodicita === contesto.periodicita);
  if (delPeriodo.length === 0) {
    return {
      motivo: {
        codice: 'PERIODICITA_NON_PREVISTA',
        messaggio: `Il tariffario non prevede la periodicità ${contesto.periodicita.toLowerCase()} per ${cosa}.`,
      },
    };
  }

  return { righe: delPeriodo };
}

/**
 * La sola riga in cui ricade il valore. Nessuna riga o più righe sono motivi
 * di non calcolabilità: scegliere la prima, come faceva il motore precedente,
 * rende l'importo dipendente dall'ordine di inserimento nel database.
 */
function unicaFascia(
  righe: TariffaInput[],
  valore: Dec,
  estremi: Estremi,
  campo: string,
  cosa: string,
): { riga: TariffaInput } | { motivo: MotivoNonCalcolabile } {
  const trovate = righe.filter((t) => inFascia(valore, fasciaDi(t), estremi));

  if (trovate.length === 0) {
    const fasce = righe.map((t) => descriviFascia(fasciaDi(t))).join(', ');
    return {
      motivo: {
        codice: 'FUORI_FASCIA',
        campo,
        messaggio: `${etichetta(campo)} ${quantita(valore)} fuori dalle fasce del tariffario per ${cosa} (${fasce}).`,
      },
    };
  }

  if (trovate.length > 1) {
    const elenco = trovate.map((t) => t.descrizione ?? descriviFascia(fasciaDi(t))).join('; ');
    return {
      motivo: {
        codice: 'TARIFFA_AMBIGUA',
        campo,
        messaggio: `Più tariffe applicabili per ${cosa} con ${etichetta(campo)} ${quantita(valore)}: ${elenco}. Il tariffario va corretto.`,
      },
    };
  }

  return { riga: trovate[0] };
}

function importoFisso(riga: TariffaInput, cosa: string): { importo: Dec } | { motivo: MotivoNonCalcolabile } {
  if (riga.importoFisso === null) {
    return {
      motivo: {
        codice: 'TARIFFA_MANCANTE',
        messaggio: `La tariffa "${riga.descrizione ?? cosa}" non ha un importo fisso.`,
      },
    };
  }
  return { importo: dec(riga.importoFisso) };
}

function vocefissa(descrizione: string, importo: Dec): VoceApplicata {
  return { descrizione, importo: euro(importo), unitaMisura: 'FISSO', valore: null };
}

// =====================================================
// AUTOVETTURE: scaglioni progressivi per KW, per classe Euro
// =====================================================

const autovettura: Regola = (v, righe, contesto) => {
  const mancanti = richiedi(v, ['potenzaKw', 'classeAmbientale']);
  if (mancanti.length) return nonCalcolabile(mancanti);

  const categoria = CATEGORIA_AUTOVETTURE[v.classeAmbientale!];
  if (!categoria) {
    return nonCalcolabile([
      {
        codice: 'DATO_NON_VALIDO',
        campo: 'classeAmbientale',
        messaggio: `Classe ambientale "${v.classeAmbientale}" non riconosciuta.`,
      },
    ]);
  }

  const cosa = `${v.tipoVeicolo} ${categoria}`;
  const sel = righePer(righe, { unita: 'KW', categoriaEuro: categoria }, contesto, cosa);
  if ('motivo' in sel) return nonCalcolabile([sel.motivo]);

  const sovrapposte = primaSovrapposizione(sel.righe);
  if (sovrapposte) {
    return nonCalcolabile([
      {
        codice: 'TARIFFA_AMBIGUA',
        messaggio: `Scaglioni sovrapposti nel tariffario per ${cosa}: "${sovrapposte[0].descrizione}" e "${sovrapposte[1].descrizione}".`,
      },
    ]);
  }

  const kw = dec(v.potenzaKw!);
  const scaglioni = [...sel.righe].sort((a, b) => fasciaDi(a).min.comparedTo(fasciaDi(b).min));
  const ultimo = fasciaDi(scaglioni[scaglioni.length - 1]);
  if (ultimo.max !== null && kw.greaterThan(ultimo.max)) {
    return nonCalcolabile([
      {
        codice: 'FUORI_FASCIA',
        campo: 'potenzaKw',
        messaggio: `Potenza ${quantita(kw)} KW oltre l'ultimo scaglione del tariffario per ${cosa}.`,
      },
    ]);
  }

  let totale = ZERO;
  const voci: VoceApplicata[] = [];
  const dettaglio = [`${v.tipoVeicolo} ${v.classeAmbientale} (${categoria}) - ${quantita(kw)} KW`];

  for (const t of scaglioni) {
    const fascia = fasciaDi(t);
    if (!kw.greaterThan(fascia.min)) continue;

    const finoA = fascia.max === null ? kw : D_min(kw, fascia.max);
    const kwInFascia = finoA.minus(fascia.min);
    const unitario = dec(t.importoUnitario);
    const importoFascia = kwInFascia.times(unitario);
    totale = totale.plus(importoFascia);

    voci.push({
      descrizione:
        t.descrizione ??
        `${categoria} - ${fascia.max === null ? `oltre ${quantita(fascia.min)}` : `fino a ${quantita(fascia.max)}`} KW`,
      importo: euro(importoFascia),
      unitaMisura: 'KW',
      valore: quantita(kwInFascia),
    });
    dettaglio.push(
      `${quantita(kwInFascia)} KW x €${unitario.toFixed(4)}/KW = €${importoFascia.toFixed(2)}`,
    );
  }

  return { importo: totale, voci, dettaglio, motivi: [] };
};

function D_min(a: Dec, b: Dec): Dec {
  return a.lessThan(b) ? a : b;
}

// =====================================================
// MOTOCICLI: fisso fino a una soglia, poi per KW eccedenti
// =====================================================

const motociclo: Regola = (v, righe, contesto) => {
  const mancanti = richiedi(v, ['potenzaKw', 'classeAmbientale']);
  if (mancanti.length) return nonCalcolabile(mancanti);

  const categoria = CATEGORIA_MOTOCICLI[v.classeAmbientale!];
  if (!categoria) {
    return nonCalcolabile([
      {
        codice: 'DATO_NON_VALIDO',
        campo: 'classeAmbientale',
        messaggio: `Classe ambientale "${v.classeAmbientale}" non riconosciuta.`,
      },
    ]);
  }

  const cosa = `Motociclo ${categoria}`;
  const sel = righePer(righe, { unita: 'KW', categoriaEuro: categoria }, contesto, cosa);
  if ('motivo' in sel) return nonCalcolabile([sel.motivo]);

  const kw = dec(v.potenzaKw!);
  const scelta = unicaFascia(sel.righe, kw, '(]', 'potenzaKw', cosa);
  if ('motivo' in scelta) return nonCalcolabile([scelta.motivo]);

  const t = scelta.riga;
  const fascia = fasciaDi(t);
  const dettaglio = [`Motociclo ${v.classeAmbientale} (${categoria}) - ${quantita(kw)} KW`];

  if (t.importoFisso !== null && dec(t.importoFisso).greaterThan(0)) {
    const fisso = dec(t.importoFisso);
    dettaglio.push(`Importo fisso fino a ${quantita(fascia.max ?? fascia.min)} KW: €${fisso.toFixed(2)}`);
    return {
      importo: fisso,
      voci: [
        vocefissa(t.descrizione ?? `Motociclo fino a ${quantita(fascia.max ?? fascia.min)} KW`, fisso),
      ],
      dettaglio,
      motivi: [],
    };
  }

  // Fascia per KW eccedenti: si aggiunge l'importo fisso della fascia che
  // termina dove questa comincia.
  const unitario = dec(t.importoUnitario);
  const eccedenti = kw.minus(fascia.min);
  const base = sel.righe.find((r) => r.sogliaMax !== null && dec(r.sogliaMax).equals(fascia.min));
  const baseFissa = base?.importoFisso ? dec(base.importoFisso) : ZERO;
  const totale = eccedenti.times(unitario).plus(baseFissa);

  dettaglio.push(
    `${quantita(eccedenti)} KW eccedenti x €${unitario.toFixed(4)}/KW = €${eccedenti.times(unitario).toFixed(2)}`,
  );

  return {
    importo: totale,
    voci: [
      {
        descrizione: t.descrizione ?? `Motociclo oltre ${quantita(fascia.min)} KW`,
        importo: euro(totale),
        unitaMisura: 'KW',
        valore: quantita(eccedenti),
      },
    ],
    dettaglio,
    motivi: [],
  };
};

// =====================================================
// AUTOCARRI: per portata sotto le 12 t, per assi e sospensioni da 12 t
// =====================================================

const SOGLIA_AUTOCARRO_PESANTE = dec(12000);

/**
 * Tassa di base degli autocarri e dei veicoli tariffati allo stesso modo.
 * Il peso complessivo è indispensabile: è ciò che decide quale delle due
 * formule si applica. Il motore precedente, senza peso, ripiegava sulla
 * portata e poteva così tariffare un mezzo pesante come uno leggero.
 */
function tassaAutocarro(
  v: VeicoloInput,
  righe: TariffaInput[],
  contesto: ContestoCalcolo,
): EsitoRegola {
  const tipo = v.tipoVeicolo!;
  const hannoBase = righe.some((t) => t.unitaMisura === 'ASSI' || t.unitaMisura === 'KG_PORTATA');
  if (!hannoBase) {
    return nonCalcolabile([
      {
        codice: 'TARIFFA_MANCANTE',
        messaggio: `Il tariffario non contiene la tassa di base per ${tipo}.`,
      },
    ]);
  }

  const mancaPeso = richiedi(v, ['pesoComplessivoKg']);
  if (mancaPeso.length) return nonCalcolabile(mancaPeso);

  const peso = dec(v.pesoComplessivoKg!);

  if (peso.greaterThanOrEqualTo(SOGLIA_AUTOCARRO_PESANTE)) {
    const mancanti = richiedi(v, ['numeroAssi', 'tipoSospensione']);
    if (mancanti.length) return nonCalcolabile(mancanti);

    const cosa = `${tipo} da 12 t con sospensioni ${v.tipoSospensione!.toLowerCase()}`;
    const sel = righePer(righe, { unita: 'ASSI', tipoSospensione: v.tipoSospensione! }, contesto, cosa);
    if ('motivo' in sel) return nonCalcolabile([sel.motivo]);

    const scelta = unicaFascia(sel.righe, dec(v.numeroAssi!), '[]', 'numeroAssi', cosa);
    if ('motivo' in scelta) return nonCalcolabile([scelta.motivo]);

    const fisso = importoFisso(scelta.riga, cosa);
    if ('motivo' in fisso) return nonCalcolabile([fisso.motivo]);

    return {
      importo: fisso.importo,
      voci: [
        vocefissa(
          scelta.riga.descrizione ??
            `${tipo} >= 12 ton, ${v.numeroAssi} assi, sospensioni ${v.tipoSospensione!.toLowerCase()}`,
          fisso.importo,
        ),
      ],
      dettaglio: [
        `Autocarro pesante (${quantita(peso)} kg) - ${v.numeroAssi} assi, sospensioni ${v.tipoSospensione!.toLowerCase()}`,
        `Importo ${contesto.periodicita.toLowerCase()}: €${fisso.importo.toFixed(2)}`,
      ],
      motivi: [],
    };
  }

  const mancaPortata = richiedi(v, ['portataKg']);
  if (mancaPortata.length) return nonCalcolabile(mancaPortata);

  const cosa = `${tipo} sotto le 12 t`;
  const sel = righePer(righe, { unita: 'KG_PORTATA' }, contesto, cosa);
  if ('motivo' in sel) return nonCalcolabile([sel.motivo]);

  const portata = dec(v.portataKg!);
  const scelta = unicaFascia(sel.righe, portata, '[)', 'portataKg', cosa);
  if ('motivo' in scelta) return nonCalcolabile([scelta.motivo]);

  const fisso = importoFisso(scelta.riga, cosa);
  if ('motivo' in fisso) return nonCalcolabile([fisso.motivo]);

  return {
    importo: fisso.importo,
    voci: [vocefissa(scelta.riga.descrizione ?? `Autocarro portata ${quantita(portata)} kg`, fisso.importo)],
    dettaglio: [
      `Autocarro leggero - portata ${quantita(portata)} kg`,
      `Importo ${contesto.periodicita.toLowerCase()}: €${fisso.importo.toFixed(2)}`,
    ],
    motivi: [],
  };
}

const autocarro: Regola = (v, righe, contesto) => tassaAutocarro(v, righe, contesto);

/**
 * Trattore stradale: tassa di base come gli autocarri, più la tassa
 * aggiuntiva per la massa rimorchiabile quando il tariffario la prevede.
 * I motivi delle due parti vengono raccolti insieme, così l'operatore sa in
 * una volta sola tutto ciò che manca.
 */
const trattore: Regola = (v, righe, contesto) => {
  const base = tassaAutocarro(v, righe, contesto);
  const motivi = [...base.motivi];
  const voci = [...base.voci];
  const dettaglio = [...base.dettaglio];
  let totale = base.importo;

  const righeMassa = righe.filter((t) => t.unitaMisura === 'MASSA_RIMORCHIABILE');
  if (righeMassa.length > 0) {
    const cosa = `la tassa aggiuntiva di ${v.tipoVeicolo}`;
    const mancante = richiedi(v, ['massaRimorchiabileKg']);
    const sel = righePer(righe, { unita: 'MASSA_RIMORCHIABILE' }, contesto, cosa);

    if (mancante.length) {
      motivi.push(...mancante);
    } else if ('motivo' in sel) {
      motivi.push(sel.motivo);
    } else {
      const massa = dec(v.massaRimorchiabileKg!);
      const scelta = unicaFascia(sel.righe, massa, '[)', 'massaRimorchiabileKg', cosa);
      if ('motivo' in scelta) {
        motivi.push(scelta.motivo);
      } else {
        const fisso = importoFisso(scelta.riga, cosa);
        if ('motivo' in fisso) {
          motivi.push(fisso.motivo);
        } else {
          voci.push(
            vocefissa(
              scelta.riga.descrizione ?? `Tassa aggiuntiva massa rimorchiabile ${quantita(massa)} kg`,
              fisso.importo,
            ),
          );
          dettaglio.push(`Tassa aggiuntiva massa rimorchiabile: €${fisso.importo.toFixed(2)}`);
          totale = totale === null ? null : totale.plus(fisso.importo);
        }
      }
    }
  }

  return motivi.length ? nonCalcolabile(motivi) : { importo: totale, voci, dettaglio, motivi };
};

// =====================================================
// VEICOLI TARIFFATI A KW (tariffa unica, non progressiva)
// =====================================================

const perKw: Regola = (v, righe, contesto) => {
  const mancanti = richiedi(v, ['potenzaKw']);
  if (mancanti.length) return nonCalcolabile(mancanti);

  const cosa = v.tipoVeicolo!;
  const sel = righePer(righe, { unita: 'KW' }, contesto, cosa);
  if ('motivo' in sel) return nonCalcolabile([sel.motivo]);

  const kw = dec(v.potenzaKw!);
  const scelta = unicaFascia(sel.righe, kw, '(]', 'potenzaKw', cosa);
  if ('motivo' in scelta) return nonCalcolabile([scelta.motivo]);

  const unitario = dec(scelta.riga.importoUnitario);
  const importo = kw.times(unitario);

  return {
    importo,
    voci: [
      {
        descrizione: scelta.riga.descrizione ?? `${cosa} - tariffa per KW`,
        importo: euro(importo),
        unitaMisura: 'KW',
        valore: quantita(kw),
      },
    ],
    dettaglio: [
      `${cosa} - ${quantita(kw)} KW`,
      `${quantita(kw)} KW x €${unitario.toFixed(4)}/KW = €${importo.toFixed(2)}`,
    ],
    motivi: [],
  };
};

// =====================================================
// MOTOCARRI E MOTOFURGONI: importo fisso per fascia di cilindrata
// =====================================================

const perCilindrata: Regola = (v, righe, contesto) => {
  const mancanti = richiedi(v, ['cilindrata']);
  if (mancanti.length) return nonCalcolabile(mancanti);

  const cosa = v.tipoVeicolo!;
  const sel = righePer(righe, { unita: 'CC' }, contesto, cosa);
  if ('motivo' in sel) return nonCalcolabile([sel.motivo]);

  const cc = dec(v.cilindrata!);
  const scelta = unicaFascia(sel.righe, cc, '[)', 'cilindrata', cosa);
  if ('motivo' in scelta) return nonCalcolabile([scelta.motivo]);

  const fisso = importoFisso(scelta.riga, cosa);
  if ('motivo' in fisso) return nonCalcolabile([fisso.motivo]);

  return {
    importo: fisso.importo,
    voci: [vocefissa(scelta.riga.descrizione ?? `${cosa} - cilindrata ${quantita(cc)} cc`, fisso.importo)],
    dettaglio: [`${cosa} - cilindrata ${quantita(cc)} cc`, `Importo fisso: €${fisso.importo.toFixed(2)}`],
    motivi: [],
  };
};

// =====================================================
// RIMORCHI: tassa fissa, eventualmente per fascia di peso
// =====================================================

/**
 * Il motore precedente applicava la prima tariffa fissa trovata ignorando le
 * soglie: un rimorchio da 5 t pagava la tariffa "rimorchi sotto le 3,5 t".
 * Qui le soglie sono rispettate, e il peso diventa necessario solo quando il
 * tariffario le definisce.
 */
const rimorchio: Regola = (v, righe, contesto) => {
  const cosa = v.tipoVeicolo!;
  const sel = righePer(righe, { unita: 'FISSO' }, contesto, cosa);
  if ('motivo' in sel) return nonCalcolabile([sel.motivo]);

  const conSoglie = sel.righe.some((t) => {
    const f = fasciaDi(t);
    return f.min.greaterThan(0) || f.max !== null;
  });

  let riga: TariffaInput;
  if (conSoglie) {
    const mancanti = richiedi(v, ['pesoComplessivoKg']);
    if (mancanti.length) return nonCalcolabile(mancanti);
    const scelta = unicaFascia(sel.righe, dec(v.pesoComplessivoKg!), '[)', 'pesoComplessivoKg', cosa);
    if ('motivo' in scelta) return nonCalcolabile([scelta.motivo]);
    riga = scelta.riga;
  } else if (sel.righe.length > 1) {
    return nonCalcolabile([
      {
        codice: 'TARIFFA_AMBIGUA',
        messaggio: `Più tariffe fisse senza soglie per ${cosa}: il tariffario va corretto.`,
      },
    ]);
  } else {
    riga = sel.righe[0];
  }

  const fisso = importoFisso(riga, cosa);
  if ('motivo' in fisso) return nonCalcolabile([fisso.motivo]);

  return {
    importo: fisso.importo,
    voci: [vocefissa(riga.descrizione ?? `${cosa} - tassa fissa`, fisso.importo)],
    dettaglio: [cosa, `Tassa fissa: €${fisso.importo.toFixed(2)}`],
    motivi: [],
  };
};

// =====================================================
// RIMORCHI TRASPORTO PERSONE: importo fisso per numero di posti
// =====================================================

const rimorchioPersone: Regola = (v, righe, contesto) => {
  const mancanti = richiedi(v, ['numeroPosti']);
  if (mancanti.length) return nonCalcolabile(mancanti);

  const cosa = 'Rimorchio trasporto persone';
  const sel = righePer(righe, { unita: 'POSTI' }, contesto, cosa);
  if ('motivo' in sel) return nonCalcolabile([sel.motivo]);

  const posti = dec(v.numeroPosti!);
  const scelta = unicaFascia(sel.righe, posti, '[]', 'numeroPosti', cosa);
  if ('motivo' in scelta) return nonCalcolabile([scelta.motivo]);

  const fisso = importoFisso(scelta.riga, cosa);
  if ('motivo' in fisso) return nonCalcolabile([fisso.motivo]);

  return {
    importo: fisso.importo,
    voci: [vocefissa(scelta.riga.descrizione ?? `${cosa} - ${v.numeroPosti} posti`, fisso.importo)],
    dettaglio: [`${cosa} - ${v.numeroPosti} posti`, `Importo fisso: €${fisso.importo.toFixed(2)}`],
    motivi: [],
  };
};

// =====================================================
// REGISTRO DELLE REGOLE
// =====================================================

/**
 * Tipo di veicolo -> regola. Un tipo assente da qui non ha una formula di
 * calcolo: il motore lo dichiara invece di ripiegare, come faceva il
 * precedente, su un calcolo generico per KW che dava sempre zero.
 */
export const REGOLE: Readonly<Record<string, Regola>> = {
  Autovettura: autovettura,
  'Autoveicolo uso promiscuo': autovettura,
  Motociclo: motociclo,
  Autocarro: autocarro,
  Autotreno: autocarro,
  Autoarticolato: autocarro,
  'Trattore stradale': trattore,
  Autobus: perKw,
  'Autoveicolo speciale': perKw,
  Autocaravan: perKw,
  Motocarro: perCilindrata,
  Motofurgone: perCilindrata,
  Rimorchio: rimorchio,
  'Rimorchio speciale': rimorchio,
  Semirimorchio: rimorchio,
  'Rimorchio trasporto persone': rimorchioPersone,
};
