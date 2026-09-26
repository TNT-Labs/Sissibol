import React from 'react';
import { Edit, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { getClienteDisplayName } from '../../types';
import type { Veicolo } from '../../types';

interface ElencoVeicoliProps {
  veicoli: Veicolo[];
  disattivati: boolean;
  admin: boolean;
  onModifica: (veicolo: Veicolo) => void;
  onDisattiva: (veicolo: Veicolo) => void;
  onRiattiva: (veicolo: Veicolo) => void;
  onElimina: (veicolo: Veicolo) => void;
}

const DATA = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const NUMERO = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

const cliente = (v: Veicolo) => (v.cliente ? getClienteDisplayName(v.cliente) : '—');
const data = (v: Veicolo) => (v.dataImmatricolazione ? DATA.format(new Date(v.dataImmatricolazione)) : '—');
function motore(v: Veicolo): string {
  const parti = [
    v.potenzaKw ? `${NUMERO.format(Number(v.potenzaKw))} kW` : null,
    v.cilindrata ? `${NUMERO.format(Number(v.cilindrata))} cc` : null,
  ].filter(Boolean);
  return parti.length ? parti.join(' / ') : '—';
}

/** Elenco dei veicoli: tabella su schermi larghi, schede sul telefono. */
export const ElencoVeicoli: React.FC<ElencoVeicoliProps> = ({
  veicoli,
  disattivati,
  admin,
  onModifica,
  onDisattiva,
  onRiattiva,
  onElimina,
}) => {
  const azioni = (v: Veicolo) => (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => onModifica(v)}
        className="p-2 rounded text-blue-600 hover:text-blue-900 hover:bg-blue-50"
        title="Modifica"
        aria-label={`Modifica ${v.targa}`}
      >
        <Edit size={18} aria-hidden="true" />
      </button>
      {disattivati ? (
        <>
          <button
            type="button"
            onClick={() => onRiattiva(v)}
            className="p-2 rounded text-green-600 hover:text-green-800 hover:bg-green-50"
            title="Riattiva"
            aria-label={`Riattiva ${v.targa}`}
          >
            <RotateCcw size={18} aria-hidden="true" />
          </button>
          {admin && (
            <button
              type="button"
              onClick={() => onElimina(v)}
              className="p-2 rounded text-red-600 hover:text-red-900 hover:bg-red-50"
              title="Elimina definitivamente"
              aria-label={`Elimina definitivamente ${v.targa}`}
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => onDisattiva(v)}
          className="p-2 rounded text-orange-500 hover:text-orange-700 hover:bg-orange-50"
          title="Disattiva (scadenze e pagamenti restano)"
          aria-label={`Disattiva ${v.targa}`}
        >
          <XCircle size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  return (
    <>
      <table className="hidden md:table min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {['Targa', 'Cliente', 'Tipo', 'Classe', 'Potenza / cilindrata', 'Immatricolazione'].map((t) => (
              <th key={t} scope="col" className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t}
              </th>
            ))}
            <th scope="col" className="px-4 lg:px-6 py-3">
              <span className="sr-only">Azioni</span>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {veicoli.map((v) => (
            <tr key={v.id} className="hover:bg-gray-50">
              <td className="px-4 lg:px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{v.targa}</td>
              <td className="px-4 lg:px-6 py-3 text-sm text-gray-600">{cliente(v)}</td>
              <td className="px-4 lg:px-6 py-3 text-sm text-gray-600">{v.tipoVeicolo || '—'}</td>
              <td className="px-4 lg:px-6 py-3 whitespace-nowrap text-sm text-gray-600">{v.classeAmbientale || '—'}</td>
              <td className="px-4 lg:px-6 py-3 whitespace-nowrap text-sm text-gray-600">{motore(v)}</td>
              <td className="px-4 lg:px-6 py-3 whitespace-nowrap text-sm text-gray-600">{data(v)}</td>
              <td className="px-4 lg:px-6 py-1 whitespace-nowrap">{azioni(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="md:hidden divide-y divide-gray-200">
        {veicoli.map((v) => (
          <li key={v.id} className="px-4 py-3 flex items-start justify-between gap-2">
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-gray-900">{v.targa}</p>
              <p className="text-gray-700 truncate">{cliente(v)}</p>
              <p className="text-gray-500">
                {[v.tipoVeicolo, v.classeAmbientale].filter(Boolean).join(' · ') || 'Tipo non indicato'}
              </p>
              <p className="text-gray-500">
                {motore(v)} · imm. {data(v)}
              </p>
            </div>
            {azioni(v)}
          </li>
        ))}
      </ul>
    </>
  );
};
