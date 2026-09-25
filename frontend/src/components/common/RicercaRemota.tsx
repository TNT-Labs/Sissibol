import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Loader2, Search, X } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import type { SelectOption } from './SearchableSelect';

interface RicercaRemotaProps {
  label?: string;
  /** Opzione scelta (con la sua etichetta: non è fra i risultati caricati). */
  valore: SelectOption | null;
  onChange: (opzione: SelectOption | null) => void;
  /** Cerca sul server: pochi risultati per il testo scritto. */
  cerca: (testo: string) => Promise<SelectOption[]>;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Suggerimento sotto l'elenco, es. "Si cerca per targa o cliente". */
  aiuto?: string;
}

const NESSUNA_RISPOSTA = { testo: null, opzioni: [], errore: false };

/**
 * Selezione con ricerca sul server, per elenchi troppo grandi da caricare
 * interi (scadenze, veicoli). Stesso aspetto di SearchableSelect.
 *
 * Solo l'ultima ricerca conta: risposte arrivate in ritardo per un testo già
 * cambiato vengono scartate. Nessuna opzione è preselezionata.
 */
export const RicercaRemota: React.FC<RicercaRemotaProps> = ({
  label,
  valore,
  onChange,
  cerca,
  placeholder = 'Cerca...',
  required = false,
  disabled = false,
  aiuto,
}) => {
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState('');
  // Ultima risposta ricevuta e il testo a cui si riferisce (null: nessuna).
  const [risposta, setRisposta] = useState<{ testo: string | null; opzioni: SelectOption[]; errore: boolean }>(
    NESSUNA_RISPOSTA,
  );
  const [evidenziato, setEvidenziato] = useState(-1);
  const testoRitardato = useDebounce(testo, 250);
  const contenitore = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const ultimaRicerca = useRef(0);
  const cercaRef = useRef(cerca);
  const idElenco = useId();

  useEffect(() => {
    cercaRef.current = cerca;
  }, [cerca]);

  useEffect(() => {
    if (!aperto) return;
    const numero = ++ultimaRicerca.current;
    cercaRef.current(testoRitardato)
      .then((opzioni) => {
        if (numero !== ultimaRicerca.current) return;
        setRisposta({ testo: testoRitardato, opzioni, errore: false });
        setEvidenziato(opzioni.length > 0 ? 0 : -1);
      })
      .catch(() => {
        if (numero === ultimaRicerca.current) setRisposta({ testo: testoRitardato, opzioni: [], errore: true });
      });
  }, [aperto, testoRitardato]);

  const risultati = risposta.opzioni;
  const errore = risposta.errore;
  const caricamento = aperto && (risposta.testo !== testoRitardato || testo !== testoRitardato);

  const chiudi = () => {
    setAperto(false);
    setTesto('');
    setEvidenziato(-1);
    // Alla prossima apertura i risultati vengono richiesti di nuovo (una
    // scadenza appena pagata non deve ricomparire).
    setRisposta(NESSUNA_RISPOSTA);
  };

  useEffect(() => {
    const fuori = (e: MouseEvent) => {
      if (contenitore.current && !contenitore.current.contains(e.target as Node)) {
        setAperto(false);
        setTesto('');
        setEvidenziato(-1);
        setRisposta(NESSUNA_RISPOSTA);
      }
    };
    document.addEventListener('mousedown', fuori);
    return () => document.removeEventListener('mousedown', fuori);
  }, []);

  const apri = () => {
    if (disabled) return;
    setAperto(true);
    setTimeout(() => campo.current?.focus(), 0);
  };

  const scegli = (opzione: SelectOption) => {
    onChange(opzione);
    chiudi();
  };

  const tasto = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setEvidenziato((i) => Math.min(i + 1, risultati.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setEvidenziato((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (evidenziato >= 0 && risultati[evidenziato]) scegli(risultati[evidenziato]);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      chiudi();
    }
  };

  return (
    <div className="relative" ref={contenitore}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && '*'}
        </label>
      )}
      <div
        className={`w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm bg-white flex items-center justify-between transition-all ${
          disabled
            ? 'bg-gray-100 cursor-not-allowed'
            : 'cursor-pointer hover:border-gray-400 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500'
        }`}
        onClick={() => (aperto ? undefined : apri())}
      >
        <div className="flex items-center flex-1 min-w-0">
          <Search size={16} className="text-gray-400 mr-2 flex-shrink-0" aria-hidden="true" />
          {aperto ? (
            <input
              ref={campo}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={idElenco}
              aria-label={label}
              className="flex-1 outline-none bg-transparent min-w-0"
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              onKeyDown={tasto}
              placeholder={valore?.label || placeholder}
              maxLength={100}
            />
          ) : (
            <span className={`truncate ${valore ? 'text-gray-900' : 'text-gray-400'}`}>
              {valore?.label || placeholder}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
          {caricamento && aperto && <Loader2 size={16} className="text-gray-400 animate-spin" aria-hidden="true" />}
          {valore && !disabled && (
            <button
              type="button"
              aria-label="Togli la selezione"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="text-gray-400 hover:text-gray-600 p-0.5"
            >
              <X size={16} />
            </button>
          )}
          <ChevronDown size={18} className={`text-gray-400 transition-transform ${aperto ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {aperto && (
        <div
          id={idElenco}
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto"
        >
          {risultati.length === 0 ? (
            <div className="px-3 py-3 text-gray-500 text-sm text-center">
              {errore
                ? 'Ricerca non riuscita. Riprova.'
                : caricamento
                  ? 'Ricerca in corso...'
                  : testo
                    ? `Nessun risultato per "${testo}"`
                    : 'Nessun risultato'}
            </div>
          ) : (
            risultati.map((opzione, i) => (
              <div
                key={opzione.value}
                role="option"
                aria-selected={i === evidenziato}
                className={`px-3 py-2 cursor-pointer text-sm transition-colors ${
                  i === evidenziato ? 'bg-blue-100 text-blue-900' : 'text-gray-900 hover:bg-gray-100'
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => scegli(opzione)}
                onMouseEnter={() => setEvidenziato(i)}
              >
                {opzione.label}
              </div>
            ))
          )}
          {aiuto && <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-100">{aiuto}</div>}
        </div>
      )}
    </div>
  );
};
