import React from 'react';
import { Building2, CheckCircle, Edit, RotateCcw, Trash2, User, XCircle } from 'lucide-react';
import { TipoCliente, getClienteDisplayName } from '../../types';
import type { Cliente } from '../../types';

interface ElencoClientiProps {
  clienti: Cliente[];
  admin: boolean;
  onModifica: (cliente: Cliente) => void;
  onDisattiva: (cliente: Cliente) => void;
  onRiattiva: (cliente: Cliente) => void;
  onElimina: (cliente: Cliente) => void;
}

const pf = (c: Cliente) => c.tipoCliente === TipoCliente.PERSONA_FISICA;
const fiscale = (c: Cliente) => (pf(c) ? c.codiceFiscale : c.partitaIva) || '—';

const Tipo: React.FC<{ cliente: Cliente }> = ({ cliente }) =>
  pf(cliente) ? (
    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800" title="Persona fisica">
      <User size={12} className="mr-1" aria-hidden="true" />PF
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800" title="Persona giuridica">
      <Building2 size={12} className="mr-1" aria-hidden="true" />PG
    </span>
  );

const Stato: React.FC<{ cliente: Cliente; size: number }> = ({ cliente, size }) =>
  cliente.attivo ? (
    <CheckCircle size={size} className="inline text-green-600" aria-label="Attivo" />
  ) : (
    <XCircle size={size} className="inline text-red-500" aria-label="Non attivo" />
  );

/** Elenco dei clienti: tabella su schermi larghi, schede sul telefono. */
export const ElencoClienti: React.FC<ElencoClientiProps> = ({ clienti, admin, onModifica, onDisattiva, onRiattiva, onElimina }) => {
  const azioni = (c: Cliente) => {
    const nome = getClienteDisplayName(c);
    return (
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => onModifica(c)}
          className="p-2 rounded text-blue-600 hover:text-blue-900 hover:bg-blue-50"
          title="Modifica"
          aria-label={`Modifica ${nome}`}
        >
          <Edit size={18} aria-hidden="true" />
        </button>
        {c.attivo ? (
          <button
            type="button"
            onClick={() => onDisattiva(c)}
            className="p-2 rounded text-orange-500 hover:text-orange-700 hover:bg-orange-50"
            title="Disattiva (veicoli, scadenze e pagamenti restano)"
            aria-label={`Disattiva ${nome}`}
          >
            <XCircle size={18} aria-hidden="true" />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onRiattiva(c)}
              className="p-2 rounded text-green-600 hover:text-green-800 hover:bg-green-50"
              title="Riattiva"
              aria-label={`Riattiva ${nome}`}
            >
              <RotateCcw size={18} aria-hidden="true" />
            </button>
            {admin && (
              <button
                type="button"
                onClick={() => onElimina(c)}
                className="p-2 rounded text-red-600 hover:text-red-900 hover:bg-red-50"
                title="Elimina definitivamente"
                aria-label={`Elimina definitivamente ${nome}`}
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <table className="hidden md:table min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {['Tipo', 'Nome / ragione sociale', 'P.IVA / C.F.', 'Email', 'Telefono'].map((t) => (
              <th key={t} scope="col" className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t}
              </th>
            ))}
            <th scope="col" className="px-4 lg:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Attivo
            </th>
            <th scope="col" className="px-4 lg:px-6 py-3">
              <span className="sr-only">Azioni</span>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {clienti.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50">
              <td className="px-4 lg:px-6 py-3 whitespace-nowrap">
                <Tipo cliente={c} />
              </td>
              <td className="px-4 lg:px-6 py-3 text-sm font-medium text-gray-900">{getClienteDisplayName(c)}</td>
              <td className="px-4 lg:px-6 py-3 whitespace-nowrap text-sm text-gray-600">{fiscale(c)}</td>
              <td className="px-4 lg:px-6 py-3 text-sm text-gray-600 break-all">{c.email || '—'}</td>
              <td className="px-4 lg:px-6 py-3 whitespace-nowrap text-sm text-gray-600">{c.telefono || '—'}</td>
              <td className="px-4 lg:px-6 py-3 text-center">
                <Stato cliente={c} size={20} />
              </td>
              <td className="px-4 lg:px-6 py-1 whitespace-nowrap">{azioni(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="md:hidden divide-y divide-gray-200">
        {clienti.map((c) => (
          <li key={c.id} className="px-4 py-3 flex items-start justify-between gap-2">
            <div className="min-w-0 text-sm">
              <div className="flex items-center gap-2">
                <Tipo cliente={c} />
                <Stato cliente={c} size={16} />
              </div>
              <p className="font-medium text-gray-900 mt-1">{getClienteDisplayName(c)}</p>
              {fiscale(c) !== '—' && <p className="text-gray-500">{fiscale(c)}</p>}
              {c.email && <p className="text-gray-500 break-all">{c.email}</p>}
              {c.telefono && <p className="text-gray-500">{c.telefono}</p>}
            </div>
            {azioni(c)}
          </li>
        ))}
      </ul>
    </>
  );
};
