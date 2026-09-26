import { useCallback, useEffect, useState } from 'react';
import { clientiService, type PaginatedClienti } from '../../services/clienti.service';

export type StatoClienti = 'attivi' | 'nonAttivi' | 'tutti';

export interface FiltriClienti {
  pagina: number;
  ricerca: string;
  stato: StatoClienti;
}

export const DIMENSIONE_PAGINA = 50;

interface Risposta {
  chiave: string | null;
  dati: PaginatedClienti | null;
  errore: boolean;
}

/**
 * Una pagina di clienti per i filtri dati. Una richiesta per combinazione di
 * filtri; le risposte arrivate in ritardo per filtri già cambiati si scartano.
 */
export function useClienti(filtri: FiltriClienti) {
  const [versione, setVersione] = useState(0);
  const [risposta, setRisposta] = useState<Risposta>({ chiave: null, dati: null, errore: false });
  const { pagina, ricerca, stato } = filtri;
  const chiave = JSON.stringify([pagina, ricerca, stato, versione]);

  useEffect(() => {
    let valida = true;
    clientiService
      .getAllPaginated({
        page: pagina,
        pageSize: DIMENSIONE_PAGINA,
        search: ricerca || undefined,
        attivo: stato === 'tutti' ? undefined : stato === 'attivi',
      })
      .then((dati) => valida && setRisposta({ chiave, dati, errore: false }))
      .catch(() => valida && setRisposta((prima) => ({ chiave, dati: prima.dati, errore: true })));
    return () => {
      valida = false;
    };
  }, [chiave, pagina, ricerca, stato]);

  const ricarica = useCallback(() => setVersione((v) => v + 1), []);

  return {
    clienti: risposta.dati?.data ?? [],
    paginazione: risposta.dati?.pagination ?? null,
    caricamento: risposta.chiave === null,
    aggiornamento: risposta.chiave !== null && risposta.chiave !== chiave,
    errore: risposta.errore && risposta.chiave === chiave,
    ricarica,
  };
}
