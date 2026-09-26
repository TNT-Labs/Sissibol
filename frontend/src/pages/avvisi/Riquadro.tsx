import React from 'react';

/** Un conteggio che porta alla scheda corrispondente. */
export const Riquadro: React.FC<{
  etichetta: string;
  valore: number;
  evidenzia?: boolean;
  attivo: boolean;
  onClick: () => void;
}> = ({ etichetta, valore, evidenzia, attivo, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={attivo}
    className={`bg-white rounded-lg shadow p-4 sm:p-6 text-left hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500 ${attivo ? 'ring-2 ring-blue-200' : ''}`}
  >
    <div className="text-xs sm:text-sm font-medium text-gray-600">{etichetta}</div>
    <div className={`mt-1 sm:mt-2 text-2xl sm:text-3xl font-semibold ${evidenzia ? 'text-red-600' : 'text-gray-900'}`}>
      {valore}
    </div>
  </button>
);
