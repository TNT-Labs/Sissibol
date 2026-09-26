import React, { useState } from 'react';
import { useSearchParams } from 'react-router';
import { CheckCircle, Plus, RotateCcw, Users, XCircle } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { Pagination } from '../../components/common/Pagination';
import { SearchInput } from '../../components/common/SearchInput';
import { useIsAdmin } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { clientiService } from '../../services/clienti.service';
import { getClienteDisplayName } from '../../types';
import type { Cliente } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { ClienteModal } from './ClienteModal';
import { ElencoClienti } from './ElencoClienti';
import { DIMENSIONE_PAGINA, useClienti, type FiltriClienti, type StatoClienti } from './useClienti';

const STATI: { valore: StatoClienti; etichetta: string; icona?: React.ReactNode }[] = [
  { valore: 'attivi', etichetta: 'Solo attivi', icona: <CheckCircle size={16} className="mr-1 text-green-600" aria-hidden="true" /> },
  { valore: 'nonAttivi', etichetta: 'Solo non attivi', icona: <XCircle size={16} className="mr-1 text-red-500" aria-hidden="true" /> },
  { valore: 'tutti', etichetta: 'Tutti' },
];

/**
 * Clienti: elenco paginato con ricerca e filtro per stato.
 * La pagina coordina; dati, elenco e modale sono separati.
 */
export const ClientiPage: React.FC = () => {
  const toast = useToast();
  const admin = useIsAdmin();
  // ?cerca= precompila la ricerca: la pagina Avvisi vi rimanda per completare
  // l'email dei clienti che non possono essere avvisati.
  const [parametri] = useSearchParams();
  const [testo, setTesto] = useState(() => parametri.get('cerca') ?? '');
  const [filtri, setFiltri] = useState<FiltriClienti>(() => ({
    pagina: 1,
    ricerca: (parametri.get('cerca') ?? '').trim(),
    stato: 'attivi',
  }));
  const { clienti, paginazione, caricamento, aggiornamento, errore, ricarica } = useClienti(filtri);
  // Cliente in modifica (null: nuovo); undefined: modale chiuso.
  const [modale, setModale] = useState<Cliente | null | undefined>(undefined);

  // Ogni filtro riporta alla prima pagina nello stesso aggiornamento (prima
  // partivano due richieste).
  const filtra = (modifica: Partial<FiltriClienti>) => setFiltri((prima) => ({ ...prima, ...modifica, pagina: 1 }));

  // Un'azione che toglie il cliente dall'elenco mostrato: se era l'ultimo
  // della pagina si torna alla precedente.
  const esegui = async (azione: () => Promise<unknown>, riuscita: string, fallita: string) => {
    try {
      await azione();
      toast.success(riuscita);
      if (clienti.length === 1 && filtri.pagina > 1 && filtri.stato !== 'tutti')
        setFiltri((prima) => ({ ...prima, pagina: prima.pagina - 1 }));
      else ricarica();
    } catch (e) {
      toast.error(fallita, getErrorMessage(e, 'Riprova tra qualche istante.'));
    }
  };

  const disattiva = (c: Cliente) => {
    const nome = getClienteDisplayName(c);
    if (!window.confirm(`Disattivare ${nome}? Veicoli, scadenze e pagamenti restano archiviati e il cliente si potrà riattivare.`)) return;
    esegui(() => clientiService.delete(c.id), `${nome} disattivato`, 'Cliente non disattivato');
  };

  const riattiva = (c: Cliente) => {
    const nome = getClienteDisplayName(c);
    esegui(() => clientiService.update(c.id, { attivo: true }), `${nome} riattivato`, 'Cliente non riattivato');
  };

  const elimina = (c: Cliente) => {
    const nome = getClienteDisplayName(c);
    if (!window.confirm(`Eliminare DEFINITIVAMENTE ${nome}? Verranno cancellati anche tutti i suoi veicoli, le scadenze e i pagamenti.`)) return;
    esegui(() => clientiService.delete(c.id, true), `${nome} eliminato`, 'Cliente non eliminato');
  };

  // Elenco vuoto: invito ad aggiungere solo se davvero non ci sono clienti
  // (prima compariva anche quando la ricerca non trovava nulla).
  const filtrato = filtri.ricerca !== '' || filtri.stato !== 'attivi';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
          <Users className="mr-3" size={30} aria-hidden="true" />
          Clienti
        </h1>
        <Button onClick={() => setModale(null)}>
          <Plus size={20} className="mr-2" aria-hidden="true" />
          Nuovo cliente
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <SearchInput
          value={testo}
          onChange={setTesto}
          onSearch={(t) => filtra({ ricerca: t.trim() })}
          placeholder="Cerca per nome, ragione sociale, P.IVA, C.F. o email..."
          loading={aggiornamento}
        />
        <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <legend className="sr-only">Clienti da mostrare</legend>
          <span className="text-sm font-medium text-gray-700" aria-hidden="true">
            Mostra:
          </span>
          {STATI.map((s) => (
            <label key={s.valore} className="flex items-center cursor-pointer text-sm text-gray-700">
              <input
                type="radio"
                name="statoClienti"
                checked={filtri.stato === s.valore}
                onChange={() => filtra({ stato: s.valore })}
                className="mr-2 text-blue-600 focus:ring-blue-500"
              />
              {s.icona}
              {s.etichetta}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden" aria-busy={caricamento || aggiornamento}>
        {caricamento ? (
          <div className="flex justify-center items-center h-48" role="status" aria-label="Caricamento">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : errore ? (
          <div className="px-6 py-12 text-center" role="alert">
            <p className="text-red-700">Impossibile caricare i clienti.</p>
            <Button variant="secondary" className="mt-4" onClick={ricarica}>
              <RotateCcw size={16} className="mr-2" aria-hidden="true" />
              Riprova
            </Button>
          </div>
        ) : clienti.length === 0 ? (
          filtrato ? (
            <EmptyState
              type={filtri.ricerca ? 'search' : 'filter'}
              title={filtri.ricerca ? `Nessun cliente per "${filtri.ricerca}"` : 'Nessun cliente corrisponde al filtro'}
            />
          ) : (
            <EmptyState type="clienti" actionLabel="Aggiungi cliente" onAction={() => setModale(null)} />
          )
        ) : (
          // Durante l'aggiornamento le righe sono dei filtri precedenti: non si usano.
          <div className={`transition-opacity ${aggiornamento ? 'opacity-60 pointer-events-none' : ''}`}>
            <ElencoClienti
              clienti={clienti}
              admin={admin}
              onModifica={setModale}
              onDisattiva={disattiva}
              onRiattiva={riattiva}
              onElimina={elimina}
            />
          </div>
        )}
        {paginazione && !errore && (
          <Pagination
            page={paginazione.page}
            totalPages={paginazione.totalPages}
            total={paginazione.total}
            pageSize={DIMENSIONE_PAGINA}
            onPageChange={(pagina) => setFiltri((prima) => ({ ...prima, pagina }))}
          />
        )}
      </div>

      {modale !== undefined && (
        <ClienteModal
          cliente={modale}
          onClose={() => setModale(undefined)}
          onSalvato={() => {
            setModale(undefined);
            ricarica();
          }}
        />
      )}
    </div>
  );
};
