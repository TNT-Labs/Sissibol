import { useCallback, useEffect, useState } from 'react';
import { veicoliService, type PaginatedVeicoli } from '../../services/veicoli.service';

export interface FiltriVeicoli {
  pagina: number;
  idCliente?: number;
  ricerca: string;
  disattivati: boolean;
}

export const DIMENSIONE_PAGINA = 50;

interface Risposta {
  chiave: string | null;
  dati: PaginatedVeicoli | null;
  errore: boolean;
}

/**
 * Una pagina di veicoli per i filtri dati.
 *
 * Una sola richiesta per combinazione di filtri (prima partiva una richiesta
 * a ogni tasto, più una dopo la pausa); le risposte arrivate in ritardo per
 * filtri già cambiati vengono scartate.
 */
export function useVeicoli(filtri: FiltriVeicoli) {
  const [versione, setVersione] = useState(0);
  const [risposta, setRisposta] = useState<Risposta>({ chiave: null, dati: null, errore: false });
  const { pagina, idCliente, ricerca, disattivati } = filtri;
  const chiave = JSON.stringify([pagina, idCliente ?? null, ricerca, disattivati, versione]);

  useEffect(() => {
    let valida = true;
    veicoliService
      .getAllPaginated({
        page: pagina,
        pageSize: DIMENSIONE_PAGINA,
        idCliente,
        search: ricerca || undefined,
        attivo: !disattivati,
      })
      .then((dati) => valida && setRisposta({ chiave, dati, errore: false }))
      .catch(() => valida && setRisposta((prima) => ({ chiave, dati: prima.dati, errore: true })));
    return () => {
      valida = false;
    };
  }, [chiave, pagina, idCliente, ricerca, disattivati]);

  const ricarica = useCallback(() => setVersione((v) => v + 1), []);

  return {
    veicoli: risposta.dati?.data ?? [],
    paginazione: risposta.dati?.pagination ?? null,
    // Primo caricamento: niente da mostrare.
    caricamento: risposta.chiave === null,
    // Filtri cambiati o ricarica: si vede ancora l'elenco precedente, attenuato.
    aggiornamento: risposta.chiave !== null && risposta.chiave !== chiave,
    errore: risposta.errore && risposta.chiave === chiave,
    ricarica,
  };
}
