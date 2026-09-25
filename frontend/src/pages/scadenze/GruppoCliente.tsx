import React from 'react';
import { Calculator, Car, ChevronDown, ChevronRight, CreditCard, Edit, Trash2 } from 'lucide-react';
import { getClienteDisplayName } from '../../types';
import type { Cliente, Scadenza } from '../../types';
import { formattaImporto, haImporto, IMPORTO_MANCANTE } from '../../utils/importi';
import type { ClienteConScadenze } from './raggruppa';
import { COLORE_STATO, ETICHETTA_STATO, daRegolare } from './stati';

interface GruppoClienteProps {
  gruppo: ClienteConScadenze;
  aperto: boolean;
  onApriChiudi: () => void;
  onPagaTutte: (cliente: Cliente, scadenze: Scadenza[]) => void;
  onRicalcola: (scadenza: Scadenza) => void;
  onModifica: (scadenza: Scadenza) => void;
  onElimina: (scadenza: Scadenza) => void;
}

const DATA = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

/** Un cliente dello scadenziario: riga riassuntiva e, aperta, le sue scadenze. */
export const GruppoCliente: React.FC<GruppoClienteProps> = ({
  gruppo: { cliente, scadenze, veicoli },
  aperto,
  onApriChiudi,
  onPagaTutte,
  onRicalcola,
  onModifica,
  onElimina,
}) => {
  const idDettaglio = `scadenze-cliente-${cliente.id}`;
  return (
    <div>
      <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-2 hover:bg-gray-50">
        <button
          type="button"
          className="flex items-center space-x-3 min-w-0 text-left w-full sm:w-auto sm:flex-1"
          onClick={onApriChiudi}
          aria-expanded={aperto}
          aria-controls={idDettaglio}
        >
          {aperto ? (
            <ChevronDown size={20} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight size={20} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0">
            <span className="block font-medium text-gray-900 truncate">{getClienteDisplayName(cliente)}</span>
            <span className="block text-sm text-gray-500 truncate">{cliente.email || cliente.telefono || '-'}</span>
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2 pl-8 sm:pl-0">
          {scadenze.some(daRegolare) && (
            <button
              type="button"
              onClick={() => onPagaTutte(cliente, scadenze)}
              className="inline-flex items-center whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
              title="Registra il pagamento di tutte le scadenze non pagate del mese"
            >
              <CreditCard size={16} className="mr-1.5" aria-hidden="true" />
              Paga tutte
            </button>
          )}
          <span className="inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
            <Car size={16} className="mr-1" aria-hidden="true" />
            {veicoli} veicol{veicoli === 1 ? 'o' : 'i'}
          </span>
        </div>
      </div>

      {aperto && (
        <div id={idDettaglio} className="bg-gray-50 px-4 sm:px-6 py-4 overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="text-xs text-gray-500 uppercase">
                <th className="text-left py-2 pr-3">Targa</th>
                <th className="text-left py-2 pr-3">Tipo</th>
                <th className="text-left py-2 pr-3">Immatricolazione</th>
                <th className="text-left py-2 pr-3">Periodicità</th>
                <th className="text-left py-2 pr-3">Importo</th>
                <th className="text-left py-2 pr-3">Stato</th>
                <th className="text-right py-2">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {scadenze.map((scadenza) => (
                <tr key={scadenza.id} className="text-sm">
                  <td className="py-3 pr-3 font-medium text-gray-900 whitespace-nowrap">{scadenza.veicolo?.targa || '-'}</td>
                  <td className="py-3 pr-3 text-gray-500">{scadenza.veicolo?.tipoVeicolo || '-'}</td>
                  <td className="py-3 pr-3 text-gray-500 whitespace-nowrap">
                    {scadenza.veicolo?.dataImmatricolazione ? DATA.format(new Date(scadenza.veicolo.dataImmatricolazione)) : '-'}
                  </td>
                  <td className="py-3 pr-3">
                    <span className="whitespace-nowrap px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {scadenza.periodicita === 'QUADRIMESTRALE' ? '4 mesi' : 'Annuale'}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-gray-700 whitespace-nowrap">
                    {haImporto(scadenza.importoPrevisto) ? (
                      formattaImporto(scadenza.importoPrevisto)
                    ) : (
                      <span
                        className="whitespace-nowrap px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800"
                        title={IMPORTO_MANCANTE.spiegazione}
                      >
                        {IMPORTO_MANCANTE.etichetta}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    <span className={`whitespace-nowrap px-2 py-1 text-xs font-medium rounded-full ${COLORE_STATO[scadenza.stato] ?? 'bg-gray-100 text-gray-800'}`}>
                      {ETICHETTA_STATO[scadenza.stato] ?? scadenza.stato}
                    </span>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onRicalcola(scadenza)}
                      className="text-green-600 hover:text-green-900 mr-3"
                      title="Ricalcola l'importo dal tariffario"
                      aria-label={`Ricalcola l'importo di ${scadenza.veicolo?.targa ?? 'questa scadenza'}`}
                    >
                      <Calculator size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onModifica(scadenza)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                      title="Modifica scadenza"
                      aria-label={`Modifica la scadenza di ${scadenza.veicolo?.targa ?? ''}`}
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onElimina(scadenza)}
                      className="text-red-600 hover:text-red-900"
                      title="Elimina scadenza"
                      aria-label={`Elimina la scadenza di ${scadenza.veicolo?.targa ?? ''}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
