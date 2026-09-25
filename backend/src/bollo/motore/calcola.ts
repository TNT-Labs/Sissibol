/**
 * Punto di ingresso del motore di calcolo.
 *
 * Sequenza:
 *   1. esenzioni: un'esenzione totale rende il veicolo ESENTE senza bisogno
 *      dei dati tecnici;
 *   2. regola del tipo di veicolo: importo lordo, oppure motivi di non
 *      calcolabilità;
 *   3. riduzione parziale più vantaggiosa;
 *   4. sconto per domiciliazione bancaria.
 *
 * Gli arrotondamenti al centesimo avvengono negli stessi punti del motore
 * precedente (lordo, importo dopo la riduzione, importo con sconto), così che
 * i casi calcolati correttamente restino identici al centesimo.
 */

import { VERSIONE_MOTORE } from './versione';
import {
  ContestoCalcolo,
  MotivoNonCalcolabile,
  RisultatoCalcolo,
  TariffarioInput,
  VeicoloInput,
} from './tipi';
import { CENTO, alCentesimo, dec, euro } from './numeri';
import { REGOLE, datoMancante } from './regole';
import { valutaEsenzioni } from './esenzioni';

function vuoto(scontoRid: string): RisultatoCalcolo {
  return {
    versioneMotore: VERSIONE_MOTORE,
    esito: 'NON_CALCOLABILE',
    importoLordo: null,
    importo: null,
    importoRidotto: null,
    scontoRid,
    voci: [],
    esenzioni: [],
    motivi: [],
    assunzioni: [],
    note: [],
    dettaglio: [],
  };
}

/**
 * Risultato NON_CALCOLABILE per motivi individuati prima di avere un
 * tariffario (regione mancante, tariffario non configurato). È esportato per
 * il livello che seleziona il tariffario, che non appartiene al motore.
 */
export function risultatoNonCalcolabile(
  motivi: MotivoNonCalcolabile[],
  scontoRid = '0',
): RisultatoCalcolo {
  return { ...vuoto(scontoRid), motivi };
}

export function calcolaBollo(
  veicolo: VeicoloInput,
  tariffario: TariffarioInput,
  contesto: ContestoCalcolo,
): RisultatoCalcolo {
  const scontoRid = dec(tariffario.scontoRid);
  const risultato = vuoto(scontoRid.toString());

  // 1. Esenzioni
  const esenzioni = valutaEsenzioni(veicolo, tariffario.esenzioni, contesto.dataRiferimento);
  risultato.assunzioni.push(...esenzioni.assunzioni);

  if (esenzioni.totale) {
    return {
      ...risultato,
      esito: 'ESENTE',
      importo: euro(dec(0)),
      esenzioni: [esenzioni.totale],
      note: [`Veicolo esente: ${esenzioni.totale.descrizione}`],
      dettaglio: ['Veicolo esente dal pagamento del bollo'],
    };
  }

  // 2. Regola del tipo di veicolo
  if (!veicolo.tipoVeicolo) {
    return { ...risultato, motivi: [datoMancante('tipoVeicolo')] };
  }

  const regola = REGOLE[veicolo.tipoVeicolo];
  if (!regola) {
    return {
      ...risultato,
      motivi: [
        {
          codice: 'TIPO_NON_GESTITO',
          campo: 'tipoVeicolo',
          messaggio: `Nessuna regola di calcolo per il tipo "${veicolo.tipoVeicolo}": il veicolo va riclassificato.`,
        },
      ],
    };
  }

  const righe = tariffario.tariffe.filter((t) => t.tipoVeicolo === veicolo.tipoVeicolo);
  const esito = regola(veicolo, righe, contesto);

  if (esito.motivi.length > 0 || esito.importo === null) {
    return { ...risultato, motivi: esito.motivi };
  }

  // 3. Riduzione parziale
  const lordo = alCentesimo(esito.importo);
  let dovuto = lordo;
  const note: string[] = [];

  if (esenzioni.parziale) {
    const percentuale = dec(esenzioni.parziale.percentualeRiduzione!);
    const riduzione = lordo.times(percentuale).dividedBy(CENTO);
    dovuto = lordo.minus(riduzione);
    note.push(
      `Riduzione ${percentuale.toString()}%: -€${riduzione.toFixed(2)} (${esenzioni.parziale.descrizione})`,
    );
  }
  dovuto = alCentesimo(dovuto);

  // 4. Sconto per domiciliazione bancaria
  const importoRidotto = scontoRid.greaterThan(0)
    ? euro(dovuto.minus(dovuto.times(scontoRid).dividedBy(CENTO)))
    : null;

  return {
    ...risultato,
    esito: 'CALCOLATO',
    importoLordo: euro(lordo),
    importo: euro(dovuto),
    importoRidotto,
    voci: esito.voci,
    esenzioni: esenzioni.parziale ? [esenzioni.parziale] : [],
    note,
    dettaglio: esito.dettaglio,
  };
}
