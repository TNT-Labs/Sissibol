import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, Plus, RotateCcw, Wand2 } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { getMeseLabel } from '../../constants/domini';
import { useToast } from '../../context/ToastContext';
import { scadenzeService } from '../../services/scadenze.service';
import type { Cliente, Scadenza } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { FiltroPeriodo } from './FiltroPeriodo';
import { GeneraScadenzeModal } from './GeneraScadenzeModal';
import { GruppoCliente } from './GruppoCliente';
import { PagamentoMultiploModal } from './PagamentoMultiploModal';
import { raggruppaPerCliente } from './raggruppa';
import { ScadenzaModal } from './ScadenzaModal';
import { daRegolare } from './stati';
import { useScadenzeDelMese } from './useScadenzeDelMese';

/** Modale aperto: al massimo uno alla volta. */
type Aperto =
  | { tipo: 'scadenza'; scadenza: Scadenza | null }
  | { tipo: 'genera' }
  | { tipo: 'paga'; cliente: Cliente; scadenze: Scadenza[] }
  | null;

/**
 * Scadenziario: le scadenze di un mese, raggruppate per cliente.
 *
 * La pagina coordina; filtro, gruppi e modali sono componenti separati
 * (prima era un unico file di quasi 900 righe).
 */
export const ScadenzePage: React.FC = () => {
  const oggi = new Date();
  const [periodo, setPeriodo] = useState({ mese: oggi.getMonth() + 1, anno: oggi.getFullYear() });
  const { scadenze, caricamento, aggiornamento, errore, ricarica } = useScadenzeDelMese(periodo.mese, periodo.anno);
  const [aperti, setAperti] = useState<Set<number>>(new Set());
  const [modale, setModale] = useState<Aperto>(null);
  const toast = useToast();

  const gruppi = useMemo(() => raggruppaPerCliente(scadenze), [scadenze]);
  const veicoliInScadenza = gruppi.reduce((totale, g) => totale + g.veicoli, 0);

  const apriChiudi = (idCliente: number) =>
    setAperti((prima) => {
      const dopo = new Set(prima);
      if (dopo.has(idCliente)) dopo.delete(idCliente);
      else dopo.add(idCliente);
      return dopo;
    });

  const ricalcola = async (scadenza: Scadenza) => {
    try {
      await scadenzeService.ricalcolaImporto(scadenza.id);
      toast.success('Importo ricalcolato', "L'importo previsto è stato aggiornato dal tariffario.");
      ricarica();
    } catch (e) {
      // Il backend indica i dati mancanti; l'importo esistente resta invariato.
      toast.error('Ricalcolo non possibile', getErrorMessage(e, 'Verifica che il veicolo abbia tutti i dati necessari.'));
    }
  };

  const elimina = async (scadenza: Scadenza) => {
    if (!window.confirm(`Eliminare la scadenza di ${scadenza.veicolo?.targa ?? 'questo veicolo'}?`)) return;
    try {
      await scadenzeService.delete(scadenza.id);
      toast.success('Scadenza eliminata');
      ricarica();
    } catch (e) {
      // Prima l'errore finiva solo nella console.
      toast.error('Scadenza non eliminata', getErrorMessage(e, 'Riprova tra qualche istante.'));
    }
  };

  const chiudiERicarica = () => {
    setModale(null);
    ricarica();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
          <CalendarIcon className="mr-3" size={30} aria-hidden="true" />
          Scadenziario
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setModale({ tipo: 'genera' })}>
            <Wand2 size={20} className="mr-2" aria-hidden="true" />
            Genera scadenze
          </Button>
          <Button onClick={() => setModale({ tipo: 'scadenza', scadenza: null })}>
            <Plus size={20} className="mr-2" aria-hidden="true" />
            Nuova scadenza
          </Button>
        </div>
      </div>

      {/* Il filtro resta visibile durante il caricamento: prima spariva a ogni cambio di mese. */}
      <FiltroPeriodo
        mese={periodo.mese}
        anno={periodo.anno}
        onChange={(mese, anno) => setPeriodo({ mese, anno })}
        riepilogo={
          !caricamento && (
            <>
              <span className="font-semibold text-lg text-blue-600">{veicoliInScadenza}</span> veicol
              {veicoliInScadenza === 1 ? 'o' : 'i'} in scadenza
            </>
          )
        }
      />

      <div className="bg-white rounded-lg shadow overflow-hidden" aria-busy={caricamento || aggiornamento}>
        {caricamento ? (
          <div className="flex justify-center items-center h-48" role="status" aria-label="Caricamento">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : errore ? (
          <div className="px-6 py-12 text-center" role="alert">
            <p className="text-red-700">Impossibile caricare le scadenze.</p>
            <Button variant="secondary" className="mt-4" onClick={ricarica}>
              <RotateCcw size={16} className="mr-2" aria-hidden="true" />
              Riprova
            </Button>
          </div>
        ) : gruppi.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            Nessuna scadenza per {getMeseLabel(periodo.mese).toLowerCase()} {periodo.anno}
          </div>
        ) : (
          <div className={`divide-y divide-gray-200 transition-opacity ${aggiornamento ? 'opacity-60' : ''}`}>
            {gruppi.map((gruppo) => (
              <GruppoCliente
                key={gruppo.cliente.id}
                gruppo={gruppo}
                aperto={aperti.has(gruppo.cliente.id)}
                onApriChiudi={() => apriChiudi(gruppo.cliente.id)}
                onPagaTutte={(cliente, elenco) => setModale({ tipo: 'paga', cliente, scadenze: elenco.filter(daRegolare) })}
                onRicalcola={ricalcola}
                onModifica={(scadenza) => setModale({ tipo: 'scadenza', scadenza })}
                onElimina={elimina}
              />
            ))}
          </div>
        )}
      </div>

      {modale?.tipo === 'scadenza' && (
        <ScadenzaModal
          scadenza={modale.scadenza}
          mese={periodo.mese}
          anno={periodo.anno}
          onClose={() => setModale(null)}
          onSalvata={chiudiERicarica}
        />
      )}
      {modale?.tipo === 'genera' && <GeneraScadenzeModal onClose={() => setModale(null)} onGenerate={ricarica} />}
      {modale?.tipo === 'paga' && (
        <PagamentoMultiploModal
          cliente={modale.cliente}
          scadenze={modale.scadenze}
          mese={periodo.mese}
          anno={periodo.anno}
          onClose={() => setModale(null)}
          onPagato={chiudiERicarica}
        />
      )}
    </div>
  );
};
