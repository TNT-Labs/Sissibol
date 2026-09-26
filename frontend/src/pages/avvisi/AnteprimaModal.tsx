import React from 'react';
import { Info } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import type { AnteprimaAvviso } from '../../services/avvisi.service';

const DettaglioAnteprima: React.FC<{ anteprima: AnteprimaAvviso }> = ({ anteprima }) => {
  if (!anteprima.email) {
    return (
      <div className="flex gap-3 p-4 bg-gray-50 rounded-lg text-sm text-gray-700">
        <Info size={20} className="text-gray-500 flex-shrink-0" aria-hidden="true" />
        <p>{anteprima.motivo ?? 'Nessun contenuto disponibile.'}</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="font-medium text-gray-500">A</dt>
        <dd className="text-gray-900 break-all">{anteprima.destinatari.join(', ') || '-'}</dd>
        <dt className="font-medium text-gray-500">Oggetto</dt>
        <dd className="text-gray-900 break-words">{anteprima.email.oggetto}</dd>
      </dl>
      {!anteprima.inviato && anteprima.avvisi.length > 1 && (
        <p className="text-sm text-blue-800 bg-blue-50 rounded-lg px-3 py-2">
          Un'unica email per cliente: comprende {anteprima.avvisi.length} avvisi in coda.
        </p>
      )}
      <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-[50vh] overflow-y-auto">
        {anteprima.email.testo}
      </pre>
    </div>
  );
};

/** Email che partirà (o è partita) per un avviso. Montato solo quando è aperto. */
export const AnteprimaModal: React.FC<{ anteprima: AnteprimaAvviso; onClose: () => void }> = ({ anteprima, onClose }) => (
  <Modal isOpen onClose={onClose} title={anteprima.inviato ? 'Email inviata' : 'Anteprima email'} maxWidth="2xl">
    <DettaglioAnteprima anteprima={anteprima} />
  </Modal>
);
