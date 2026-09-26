import React from 'react';
import { Link } from 'react-router';
import { UserX } from 'lucide-react';
import { EmptyState } from '../../components/common/EmptyState';
import type { ClienteSenzaRecapito } from '../../services/avvisi.service';
import { formattaGiorno } from './formato';

/** Clienti con scadenze vicine che non si possono avvisare, con il collegamento per completarli. */
export const ElencoSenzaEmail: React.FC<{ clienti: ClienteSenzaRecapito[] }> = ({ clienti }) => {
  if (clienti.length === 0) {
    return (
      <EmptyState
        type="generic"
        title="Tutti i clienti sono raggiungibili"
        description="Ogni cliente con scadenze nei prossimi 30 giorni ha un indirizzo email valido."
      />
    );
  }
  return (
    <div>
      <p className="px-4 py-3 text-sm text-gray-600 border-b border-gray-100">
        Questi clienti hanno scadenze nei prossimi 30 giorni ma nessun indirizzo email utilizzabile: non
        riceveranno avvisi finché non viene inserito.
      </p>
      <ul className="divide-y divide-gray-200">
        {clienti.map((c) => (
          <li key={c.idCliente} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <UserX size={20} className="text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{c.nome}</p>
                <p className="text-sm text-gray-500 break-words">
                  {c.email ? <span className="text-red-700 break-all">Email non valida: {c.email}</span> : 'Email mancante'}
                  {' · '}
                  {c.scadenze} {c.scadenze === 1 ? 'scadenza' : 'scadenze'}, la prima il {formattaGiorno(c.primaScadenza)}
                </p>
              </div>
            </div>
            <Link
              to={`/clienti?cerca=${encodeURIComponent(c.nome)}`}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap self-start sm:self-auto"
            >
              Completa l'email →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};
