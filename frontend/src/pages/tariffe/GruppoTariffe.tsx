import React from 'react';
import { ChevronDown, ChevronRight, Edit2 } from 'lucide-react';
import type { TariffaBollo } from '../../types';
import { formattaImporto, formattaImportoUnitario, haImporto } from '../../utils/importi';
import {
  ETICHETTA_PERIODICITA,
  etichettaUnita,
  formattaSoglia,
  soloImportoFisso,
  type GruppoTariffe as Gruppo,
} from './tariffe';

interface GruppoTariffeProps {
  gruppo: Gruppo;
  aperto: boolean;
  onApriChiudi: () => void;
  /** Assente per chi non è amministratore: le tariffe sono in sola lettura. */
  onModifica?: (tariffa: TariffaBollo) => void;
}

const importoFisso = (t: TariffaBollo) => (haImporto(t.importoFisso) ? formattaImporto(t.importoFisso) : '—');
const importoUnitario = (t: TariffaBollo) =>
  soloImportoFisso(t)
    ? '—'
    : `${formattaImportoUnitario(t.importoUnitario)}/${etichettaUnita(t.unitaMisura)}`;
const scaglione = (t: TariffaBollo) => `${formattaSoglia(t)}${t.tipoSospensione ? ` (${t.tipoSospensione})` : ''}`;

/** Le tariffe di un tipo di veicolo: tabella su schermi larghi, schede sul telefono. */
export const GruppoTariffe: React.FC<GruppoTariffeProps> = ({ gruppo, aperto, onApriChiudi, onModifica }) => {
  const idDettaglio = `tariffe-${gruppo.tipoVeicolo.replace(/\W+/g, '-')}`;
  const modifica = (t: TariffaBollo) =>
    onModifica && (
      <button
        type="button"
        onClick={() => onModifica(t)}
        className="p-1.5 rounded text-blue-600 hover:text-blue-800 hover:bg-blue-50"
        title="Modifica importi"
        aria-label={`Modifica la tariffa ${gruppo.tipoVeicolo} ${t.categoriaEuro ?? ''} ${formattaSoglia(t)}`}
      >
        <Edit2 size={16} aria-hidden="true" />
      </button>
    );

  return (
    <div>
      <button
        type="button"
        className="w-full px-4 sm:px-6 py-3 flex items-center text-left hover:bg-gray-50 transition-colors"
        onClick={onApriChiudi}
        aria-expanded={aperto}
        aria-controls={idDettaglio}
      >
        {aperto ? (
          <ChevronDown size={20} className="mr-2 text-gray-400 flex-shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight size={20} className="mr-2 text-gray-400 flex-shrink-0" aria-hidden="true" />
        )}
        <span className="font-medium text-gray-900">{gruppo.tipoVeicolo}</span>
        <span className="ml-2 text-sm text-gray-500">
          ({gruppo.tariffe.length} {gruppo.tariffe.length === 1 ? 'tariffa' : 'tariffe'})
        </span>
      </button>

      {aperto && (
        <div id={idDettaglio} className="bg-gray-50 px-4 sm:px-6 py-2">
          {/* Larghezze fisse: le colonne restano allineate da un tipo di veicolo all'altro. */}
          <table className="hidden md:table w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[18%]" />
              <col />
              <col className="w-[17%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              {onModifica && <col className="w-12" />}
            </colgroup>
            <thead>
              <tr className="text-left text-gray-500">
                <th scope="col" className="py-2 pr-4 font-medium">Categoria</th>
                <th scope="col" className="py-2 pr-4 font-medium">Scaglione</th>
                <th scope="col" className="py-2 pr-4 font-medium text-right">Importo unitario</th>
                <th scope="col" className="py-2 pr-4 font-medium text-right">Importo fisso</th>
                <th scope="col" className="py-2 pr-4 font-medium">Periodicità</th>
                {onModifica && (
                  <th scope="col" className="py-2 font-medium">
                    <span className="sr-only">Azioni</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {gruppo.tariffe.map((t) => (
                <tr key={t.id} className="border-t border-gray-200" title={t.descrizione || undefined}>
                  <td className="py-2 pr-4 break-words">{t.categoriaEuro || '—'}</td>
                  <td className="py-2 pr-4 break-words">{scaglione(t)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums whitespace-nowrap">{importoUnitario(t)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums whitespace-nowrap">{importoFisso(t)}</td>
                  <td className="py-2 pr-4">{ETICHETTA_PERIODICITA[t.periodicita] ?? t.periodicita}</td>
                  {onModifica && <td className="py-1 text-right">{modifica(t)}</td>}
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="md:hidden divide-y divide-gray-200">
            {gruppo.tariffe.map((t) => (
              <li key={t.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-gray-900">
                    {t.categoriaEuro ? `${t.categoriaEuro} · ` : ''}
                    {scaglione(t)}
                  </p>
                  <p className="text-gray-700 tabular-nums">
                    {importoUnitario(t) !== '—' && <span className="mr-3">{importoUnitario(t)}</span>}
                    {haImporto(t.importoFisso) && <span>Fisso {importoFisso(t)}</span>}
                  </p>
                  <p className="text-gray-500">{ETICHETTA_PERIODICITA[t.periodicita] ?? t.periodicita}</p>
                </div>
                {modifica(t)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
