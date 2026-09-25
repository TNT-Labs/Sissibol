import React, { useMemo, useState } from 'react';
import { Copy, Plus, RotateCcw, Settings } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { useIsAdmin } from '../../context/AuthContext';
import type { ConfigurazioneBollo, TariffaBollo } from '../../types';
import { DuplicaConfigurazioneModal } from './DuplicaConfigurazioneModal';
import { GruppoTariffe } from './GruppoTariffe';
import { NuovaConfigurazioneModal } from './NuovaConfigurazioneModal';
import { TariffaModal } from './TariffaModal';
import { configurazionePredefinita, raggruppaPerTipo } from './tariffe';
import { useConfigurazioni, useTariffe } from './useTariffe';

/** Modale aperto: al massimo uno alla volta. */
type Aperto = { tipo: 'nuova' } | { tipo: 'duplica'; origine: ConfigurazioneBollo } | { tipo: 'tariffa'; tariffa: TariffaBollo } | null;

const PERCENTUALE = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

/**
 * Tariffe del bollo per configurazione (anno e regione).
 *
 * Tutti consultano; modificano solo gli amministratori (prima un operatore
 * vedeva i pulsanti e riceveva un errore silenzioso dal server).
 */
export const TariffePage: React.FC = () => {
  const admin = useIsAdmin();
  const { configurazioni, caricamento: caricamentoConfig, errore: erroreConfig, ricarica: ricaricaConfig } =
    useConfigurazioni();
  const [idScelto, setIdScelto] = useState<number | null>(null);
  // Appena creata o duplicata: si mostra subito, anche prima che l'elenco sia ricaricato.
  const [appena, setAppena] = useState<ConfigurazioneBollo | null>(null);
  const selezionata =
    configurazioni.find((c) => c.id === idScelto) ??
    (appena && appena.id === idScelto ? appena : null) ??
    configurazionePredefinita(configurazioni, new Date().getFullYear());
  const { tariffe, caricamento, aggiornamento, errore, ricarica } = useTariffe(selezionata?.id ?? null);
  const [chiusi, setChiusi] = useState<Set<string>>(new Set());
  const [modale, setModale] = useState<Aperto>(null);

  const gruppi = useMemo(() => raggruppaPerTipo(tariffe), [tariffe]);

  const apriChiudi = (tipo: string) =>
    setChiusi((prima) => {
      const dopo = new Set(prima);
      if (dopo.has(tipo)) dopo.delete(tipo);
      else dopo.add(tipo);
      return dopo;
    });

  const mostraNuova = (configurazione: ConfigurazioneBollo) => {
    setModale(null);
    setAppena(configurazione);
    setIdScelto(configurazione.id);
    ricaricaConfig();
  };

  if (caricamentoConfig) {
    return (
      <div className="flex justify-center items-center h-64" role="status" aria-label="Caricamento">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
          <Settings className="mr-3" size={30} aria-hidden="true" />
          Tariffe bollo
        </h1>
        {admin && (
          <div className="flex flex-wrap gap-2">
            {selezionata && (
              <Button variant="secondary" onClick={() => setModale({ tipo: 'duplica', origine: selezionata })}>
                <Copy size={20} className="mr-2" aria-hidden="true" />
                Duplica per un nuovo anno
              </Button>
            )}
            <Button onClick={() => setModale({ tipo: 'nuova' })}>
              <Plus size={20} className="mr-2" aria-hidden="true" />
              Nuova configurazione
            </Button>
          </div>
        )}
      </div>

      {erroreConfig && configurazioni.length === 0 ? (
        <div className="bg-white rounded-lg shadow px-6 py-12 text-center" role="alert">
          <p className="text-red-700">Impossibile caricare le configurazioni delle tariffe.</p>
          <Button variant="secondary" className="mt-4" onClick={ricaricaConfig}>
            <RotateCcw size={16} className="mr-2" aria-hidden="true" />
            Riprova
          </Button>
        </div>
      ) : !selezionata ? (
        <div className="bg-white rounded-lg shadow px-6 py-12 text-center text-gray-500">
          Nessuna configurazione delle tariffe.
          {admin ? ' Creane una con «Nuova configurazione».' : ''}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow p-4">
            <SearchableSelect
              label="Configurazione"
              options={configurazioni.map((c) => ({
                value: c.id,
                label: `${c.regione} – ${c.annoValidita}${c.attivo ? '' : ' (non attiva)'}`,
              }))}
              value={selezionata.id}
              onChange={(v) => v && setIdScelto(Number(v))}
              placeholder="Cerca configurazione..."
            />
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-sm">
              <div>
                <dt className="inline text-gray-500">Sconto RID:</dt>
                <dd className="inline ml-2 font-medium">{PERCENTUALE.format(Number(selezionata.scontoRid))}%</dd>
              </div>
              <div>
                <dt className="inline text-gray-500">Tariffe:</dt>
                <dd className="inline ml-2 font-medium">{caricamento ? '…' : tariffe.length}</dd>
              </div>
              <div className="min-w-0">
                <dt className="inline text-gray-500">Note:</dt>
                <dd className="inline ml-2 break-words">{selezionata.note || '—'}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden" aria-busy={caricamento || aggiornamento}>
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Tariffe per tipo di veicolo</h2>
              {!admin && <p className="text-sm text-gray-500 mt-1">Solo gli amministratori possono modificarle.</p>}
            </div>
            {caricamento ? (
              <div className="flex justify-center items-center h-48" role="status" aria-label="Caricamento">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
              </div>
            ) : errore ? (
              <div className="px-6 py-12 text-center" role="alert">
                <p className="text-red-700">Impossibile caricare le tariffe.</p>
                <Button variant="secondary" className="mt-4" onClick={ricarica}>
                  <RotateCcw size={16} className="mr-2" aria-hidden="true" />
                  Riprova
                </Button>
              </div>
            ) : gruppi.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500">
                Nessuna tariffa in questa configurazione.
                {admin ? ' Per partire da un anno esistente usa «Duplica per un nuovo anno» su quella configurazione.' : ''}
              </div>
            ) : (
              <div className={`divide-y divide-gray-200 transition-opacity ${aggiornamento ? 'opacity-60' : ''}`}>
                {gruppi.map((gruppo) => (
                  <GruppoTariffe
                    key={gruppo.tipoVeicolo}
                    gruppo={gruppo}
                    aperto={!chiusi.has(gruppo.tipoVeicolo)}
                    onApriChiudi={() => apriChiudi(gruppo.tipoVeicolo)}
                    onModifica={admin ? (tariffa) => setModale({ tipo: 'tariffa', tariffa }) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {modale?.tipo === 'nuova' && (
        <NuovaConfigurazioneModal configurazioni={configurazioni} onClose={() => setModale(null)} onCreata={mostraNuova} />
      )}
      {modale?.tipo === 'duplica' && (
        <DuplicaConfigurazioneModal
          origine={modale.origine}
          configurazioni={configurazioni}
          onClose={() => setModale(null)}
          onDuplicata={mostraNuova}
        />
      )}
      {modale?.tipo === 'tariffa' && (
        <TariffaModal
          tariffa={modale.tariffa}
          onClose={() => setModale(null)}
          onSalvata={() => {
            setModale(null);
            ricarica();
          }}
        />
      )}
    </div>
  );
};
