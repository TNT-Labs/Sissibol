import React, { useEffect, useMemo, useState } from 'react';
import { Car, Plus, RotateCcw } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Pagination } from '../../components/common/Pagination';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { SearchInput } from '../../components/common/SearchInput';
import { useIsAdmin } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { clientiService } from '../../services/clienti.service';
import { veicoliService } from '../../services/veicoli.service';
import { getClienteDisplayName } from '../../types';
import type { Cliente, Veicolo } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { ElencoVeicoli } from './ElencoVeicoli';
import { DIMENSIONE_PAGINA, useVeicoli, type FiltriVeicoli } from './useVeicoli';
import { VeicoloModal } from './VeicoloModal';

/**
 * Veicoli: elenco paginato con ricerca e filtri.
 *
 * La pagina coordina; dati, elenco e modale sono separati (come lo
 * scadenziario).
 */
export const VeicoliPage: React.FC = () => {
  const toast = useToast();
  const admin = useIsAdmin();
  const [testo, setTesto] = useState('');
  const [filtri, setFiltri] = useState<FiltriVeicoli>({ pagina: 1, ricerca: '', disattivati: false });
  const { veicoli, paginazione, caricamento, aggiornamento, errore, ricarica } = useVeicoli(filtri);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  // Veicolo completo in modifica (null: nuovo); undefined: modale chiuso.
  const [modale, setModale] = useState<Veicolo | null | undefined>(undefined);

  useEffect(() => {
    clientiService
      .getAll()
      .then(setClienti)
      .catch((e) => toast.error('Clienti non caricati', getErrorMessage(e, 'Il filtro e la scelta del cliente sono vuoti.')));
  }, [toast]);

  // Ogni filtro riporta alla prima pagina, nello stesso aggiornamento (prima
  // partivano due richieste: una per il filtro, una per la pagina).
  const filtra = (modifica: Partial<FiltriVeicoli>) => setFiltri((prima) => ({ ...prima, ...modifica, pagina: 1 }));

  // Nell'elenco compaiono solo veicoli di clienti attivi: si filtra fra questi.
  const opzioniClienti = useMemo(
    () => [
      { value: '', label: 'Tutti i clienti' },
      ...clienti.filter((c) => c.attivo).map((c) => ({ value: c.id, label: getClienteDisplayName(c) })),
    ],
    [clienti],
  );

  const apriModifica = async (veicolo: Veicolo) => {
    try {
      // Dettaglio completo: l'elenco non ha tutti i campi e salvarli vuoti li cancellerebbe.
      setModale(await veicoliService.getById(veicolo.id));
    } catch (e) {
      toast.error('Veicolo non caricato', getErrorMessage(e, 'Riprova tra qualche istante.'));
    }
  };

  // Disattivare, riattivare o eliminare toglie il veicolo dall'elenco mostrato:
  // se era l'ultimo della pagina si torna alla precedente (prima restava una
  // pagina vuota).
  const esegui = async (azione: () => Promise<unknown>, riuscita: string, fallita: string) => {
    try {
      await azione();
      toast.success(riuscita);
      if (veicoli.length === 1 && filtri.pagina > 1) setFiltri((prima) => ({ ...prima, pagina: prima.pagina - 1 }));
      else ricarica();
    } catch (e) {
      toast.error(fallita, getErrorMessage(e, 'Riprova tra qualche istante.'));
    }
  };

  const disattiva = (v: Veicolo) => {
    if (!window.confirm(`Disattivare ${v.targa}? Scadenze e pagamenti restano archiviati e il veicolo si potrà riattivare.`)) return;
    esegui(() => veicoliService.delete(v.id), `${v.targa} disattivato`, 'Veicolo non disattivato');
  };

  const riattiva = (v: Veicolo) =>
    esegui(() => veicoliService.update(v.id, { attivo: true }), `${v.targa} riattivato`, 'Veicolo non riattivato');

  const elimina = (v: Veicolo) => {
    if (!window.confirm(`Eliminare DEFINITIVAMENTE ${v.targa}? Verranno cancellate anche tutte le sue scadenze e i pagamenti.`)) return;
    esegui(() => veicoliService.delete(v.id, true), `${v.targa} eliminato`, 'Veicolo non eliminato');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
          <Car className="mr-3" size={30} aria-hidden="true" />
          Veicoli
        </h1>
        <Button onClick={() => setModale(null)}>
          <Plus size={20} className="mr-2" aria-hidden="true" />
          Nuovo veicolo
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 min-w-0">
          <SearchInput
            value={testo}
            onChange={setTesto}
            onSearch={(t) => filtra({ ricerca: t.trim() })}
            placeholder="Cerca per targa o cliente..."
            loading={aggiornamento}
          />
        </div>
        <div className="w-full md:w-72">
          <SearchableSelect
            options={opzioniClienti}
            value={filtri.idCliente ?? ''}
            onChange={(v) => filtra({ idCliente: v ? Number(v) : undefined })}
            placeholder="Filtra per cliente..."
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={filtri.disattivati}
            onChange={(e) => filtra({ disattivati: e.target.checked })}
            className="text-blue-600 focus:ring-blue-500 rounded"
          />
          Mostra disattivati
        </label>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden" aria-busy={caricamento || aggiornamento}>
        {caricamento ? (
          <div className="flex justify-center items-center h-48" role="status" aria-label="Caricamento">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : errore ? (
          <div className="px-6 py-12 text-center" role="alert">
            <p className="text-red-700">Impossibile caricare i veicoli.</p>
            <Button variant="secondary" className="mt-4" onClick={ricarica}>
              <RotateCcw size={16} className="mr-2" aria-hidden="true" />
              Riprova
            </Button>
          </div>
        ) : veicoli.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            {filtri.ricerca
              ? `Nessun veicolo per "${filtri.ricerca}"`
              : filtri.disattivati
                ? 'Nessun veicolo disattivato'
                : 'Nessun veicolo'}
          </div>
        ) : (
          // Durante l'aggiornamento le righe sono dei filtri precedenti: non si usano.
          <div className={`transition-opacity ${aggiornamento ? 'opacity-60 pointer-events-none' : ''}`}>
            <ElencoVeicoli
              veicoli={veicoli}
              disattivati={filtri.disattivati}
              admin={admin}
              onModifica={apriModifica}
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
        <VeicoloModal
          veicolo={modale}
          clienti={clienti}
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
