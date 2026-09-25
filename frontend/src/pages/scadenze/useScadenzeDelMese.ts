import { useCallback, useEffect, useState } from 'react';
import { scadenzeService } from '../../services/scadenze.service';
import type { Scadenza } from '../../types';

interface Risposta {
  chiave: string | null;
  scadenze: Scadenza[];
  errore: boolean;
}

/**
 * Scadenze di un mese, ricaricate quando cambia il periodo o su richiesta.
 *
 * "In caricamento" è derivato (la risposta non corrisponde ancora al periodo
 * richiesto): cambiando mese in fretta, una risposta arrivata tardi per un
 * mese precedente non sovrascrive quella giusta.
 */
export function useScadenzeDelMese(mese: number, anno: number) {
  const [versione, setVersione] = useState(0);
  const [risposta, setRisposta] = useState<Risposta>({ chiave: null, scadenze: [], errore: false });
  const chiave = `${anno}-${mese}-${versione}`;

  useEffect(() => {
    let valida = true;
    scadenzeService
      .getByMeseAnno(mese, anno)
      .then((scadenze) => valida && setRisposta({ chiave, scadenze, errore: false }))
      .catch(() => valida && setRisposta({ chiave, scadenze: [], errore: true }));
    return () => {
      valida = false;
    };
  }, [chiave, mese, anno]);

  const ricarica = useCallback(() => setVersione((v) => v + 1), []);

  return {
    scadenze: risposta.scadenze,
    // Primo caricamento o cambio di periodo: i dati mostrati non sono del periodo scelto.
    caricamento: risposta.chiave === null || !risposta.chiave.startsWith(`${anno}-${mese}-`),
    // Ricarica dopo una modifica: i dati restano visibili mentre arrivano i nuovi.
    aggiornamento: risposta.chiave !== chiave,
    errore: risposta.errore,
    ricarica,
  };
}
