import { useCallback, useEffect, useState } from 'react';
import { bolloService } from '../../services/bollo.service';
import type { ConfigurazioneBollo, TariffaBollo } from '../../types';

interface Risposta<T> {
  chiave: string | null;
  dati: T;
  errore: boolean;
}

/** Elenco delle configurazioni (poche righe: si carica intero). */
export function useConfigurazioni() {
  const [versione, setVersione] = useState(0);
  const [risposta, setRisposta] = useState<Risposta<ConfigurazioneBollo[]>>({ chiave: null, dati: [], errore: false });
  const chiave = String(versione);

  useEffect(() => {
    let valida = true;
    bolloService
      .getConfigurazioni()
      .then((dati) => valida && setRisposta({ chiave, dati, errore: false }))
      .catch(() => valida && setRisposta((prima) => ({ chiave, dati: prima.dati, errore: true })));
    return () => {
      valida = false;
    };
  }, [chiave]);

  const ricarica = useCallback(() => setVersione((v) => v + 1), []);

  return {
    configurazioni: risposta.dati,
    caricamento: risposta.chiave === null,
    errore: risposta.errore,
    ricarica,
  };
}

/**
 * Tariffe di una configurazione. Come per lo scadenziario, "in caricamento" è
 * derivato: cambiando configurazione in fretta, una risposta arrivata tardi
 * per quella precedente non sovrascrive quella giusta (prima succedeva).
 */
export function useTariffe(idConfigurazione: number | null) {
  const [versione, setVersione] = useState(0);
  const [risposta, setRisposta] = useState<Risposta<TariffaBollo[]>>({ chiave: null, dati: [], errore: false });
  const chiave = `${idConfigurazione}-${versione}`;

  useEffect(() => {
    if (idConfigurazione === null) return;
    let valida = true;
    bolloService
      .getTariffe(idConfigurazione)
      .then((dati) => valida && setRisposta({ chiave, dati, errore: false }))
      .catch(() => valida && setRisposta({ chiave, dati: [], errore: true }));
    return () => {
      valida = false;
    };
  }, [chiave, idConfigurazione]);

  const ricarica = useCallback(() => setVersione((v) => v + 1), []);
  const diQuesta = risposta.chiave !== null && risposta.chiave.startsWith(`${idConfigurazione}-`);

  return {
    tariffe: diQuesta ? risposta.dati : [],
    caricamento: idConfigurazione !== null && !diQuesta,
    // Ricarica dopo una modifica: le tariffe restano visibili mentre arrivano le nuove.
    aggiornamento: diQuesta && risposta.chiave !== chiave,
    errore: diQuesta && risposta.errore,
    ricarica,
  };
}
