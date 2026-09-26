import { useCallback, useEffect, useState } from 'react';
import { avvisiService } from '../../services/avvisi.service';
import type { AvvisoInElenco, ClienteSenzaRecapito, StatoAvvisi } from '../../services/avvisi.service';

export type Scheda = 'DA_INVIARE' | 'ERRORE' | 'INVIATO' | 'ANNULLATO' | 'SENZA_EMAIL';

interface Risposta {
  chiave: string | null;
  scheda: Scheda | null;
  stato: StatoAvvisi | null;
  avvisi: AvvisoInElenco[];
  senzaEmail: ClienteSenzaRecapito[];
  errore: boolean;
}

/**
 * Stato dell'invio ed elenco della scheda scelta.
 *
 * Cambiando scheda in fretta, una risposta arrivata tardi per la scheda
 * precedente non si mostra più sotto quella nuova (prima succedeva, e
 * "Rimetti in coda tutti" poteva agire sugli avvisi sbagliati). Dopo
 * un'operazione l'elenco resta visibile mentre si aggiorna.
 */
export function useAvvisi(scheda: Scheda) {
  const [versione, setVersione] = useState(0);
  const [risposta, setRisposta] = useState<Risposta>({
    chiave: null,
    scheda: null,
    stato: null,
    avvisi: [],
    senzaEmail: [],
    errore: false,
  });
  const chiave = `${scheda}-${versione}`;

  useEffect(() => {
    let valida = true;
    Promise.all([
      avvisiService.stato(),
      scheda === 'SENZA_EMAIL' ? avvisiService.senzaRecapito() : Promise.resolve([]),
      scheda === 'SENZA_EMAIL' ? Promise.resolve([]) : avvisiService.elenco(scheda),
    ])
      .then(([stato, senzaEmail, avvisi]) => {
        if (valida) setRisposta({ chiave, scheda, stato, avvisi, senzaEmail, errore: false });
      })
      .catch(() => {
        if (valida) setRisposta((prima) => ({ ...prima, chiave, scheda, avvisi: [], senzaEmail: [], errore: true }));
      });
    return () => {
      valida = false;
    };
  }, [chiave, scheda]);

  const ricarica = useCallback(() => setVersione((v) => v + 1), []);
  const diQuesta = risposta.scheda === scheda;

  return {
    // Lo stato dell'invio vale per tutte le schede: resta visibile.
    stato: risposta.stato,
    avvisi: diQuesta ? risposta.avvisi : [],
    senzaEmail: diQuesta ? risposta.senzaEmail : [],
    caricamento: !diQuesta,
    aggiornamento: diQuesta && risposta.chiave !== chiave,
    errore: diQuesta && risposta.errore,
    ricarica,
  };
}
