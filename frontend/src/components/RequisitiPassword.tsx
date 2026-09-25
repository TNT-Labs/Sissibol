import React from 'react';
import { CheckCircle, Circle } from 'lucide-react';
import { requisitiPassword } from '../utils/password';

/** Elenco dei requisiti, che si spuntano mentre si scrive la password. */
export const RequisitiPassword: React.FC<{ password: string; email?: string }> = ({ password, email }) => (
  <ul className="space-y-1 text-sm" aria-label="Requisiti della password">
    {requisitiPassword(password, email).map((r) => (
      <li key={r.testo} className={`flex items-center gap-2 ${r.soddisfatto ? 'text-green-700' : 'text-gray-500'}`}>
        {r.soddisfatto ? (
          <CheckCircle size={16} className="flex-shrink-0" aria-hidden="true" />
        ) : (
          <Circle size={16} className="flex-shrink-0" aria-hidden="true" />
        )}
        <span>
          {r.testo}
          <span className="sr-only">{r.soddisfatto ? ': rispettato' : ': non ancora rispettato'}</span>
        </span>
      </li>
    ))}
  </ul>
);
