import React, { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { getMeseLabel } from '../../constants/domini';
import { useToast } from '../../context/ToastContext';
import { pagamentiService } from '../../services/pagamenti.service';
import { StatoScadenza, getClienteDisplayName } from '../../types';
import type { Cliente, Scadenza } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { formattaImporto, haImporto, IMPORTO_MANCANTE } from '../../utils/importi';

interface PagamentoMultiploModalProps {
  cliente: Cliente;
  /** Scadenze non pagate del cliente nel mese (da pagare e scadute). */
  scadenze: Scadenza[];
  mese: number;
  anno: number;
  onClose: () => void;
  onPagato: () => void;
}

const oggi = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Registra in un colpo il pagamento delle scadenze non pagate di un cliente nel mese. */
export const PagamentoMultiploModal: React.FC<PagamentoMultiploModalProps> = ({
  cliente,
  scadenze,
  mese,
  anno,
  onClose,
  onPagato,
}) => {
  const toast = useToast();
  // Data locale: toISOString() usa l'ora UTC, e fra mezzanotte e le 2 in Italia
  // proponeva il giorno precedente.
  const [dataPagamento, setDataPagamento] = useState(oggi());
  const [metodo, setMetodo] = useState('');
  const [inCorso, setInCorso] = useState(false);

  const conImporto = scadenze.filter((s) => haImporto(s.importoPrevisto));
  const senzaImporto = scadenze.length - conImporto.length;
  const totale = conImporto.reduce((somma, s) => somma + Number(s.importoPrevisto), 0);

  const conferma = async () => {
    if (!dataPagamento) {
      toast.error('Data mancante', 'Indica la data del pagamento.');
      return;
    }
    setInCorso(true);
    try {
      const esito = await pagamentiService.createMultiplo({
        idCliente: cliente.id,
        meseScadenza: mese,
        annoScadenza: anno,
        dataPagamento,
        metodoPagamento: metodo.trim() || undefined,
      });
      if (esito.pagamentiCreati > 0) {
        toast.success(
          'Pagamenti registrati',
          `${esito.pagamentiCreati} pagament${esito.pagamentiCreati === 1 ? 'o registrato' : 'i registrati'}.`,
        );
      }
      if (esito.errori.length > 0) {
        toast.warning('Alcune scadenze non pagate', esito.errori.join('; '));
      }
      onPagato();
    } catch (errore) {
      toast.error('Pagamento non registrato', getErrorMessage(errore, 'Impossibile completare il pagamento.'));
    } finally {
      setInCorso(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !inCorso && onClose()} title="Registra pagamento bolli" closable={!inCorso}>
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="font-medium text-blue-900">{getClienteDisplayName(cliente)}</p>
          <p className="text-sm text-blue-700 mt-1">
            Scadenze di {getMeseLabel(mese).toLowerCase()} {anno}
          </p>
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Da pagare ({scadenze.length})</h3>
          <ul className="max-h-48 overflow-y-auto border rounded-lg divide-y">
            {scadenze.map((s) => (
              <li key={s.id} className="px-3 py-2 flex justify-between items-center gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{s.veicolo?.targa}</span>
                  <span className="text-gray-500 ml-2">{s.veicolo?.tipoVeicolo}</span>
                  {s.stato === StatoScadenza.SCADUTO && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">scaduta</span>
                  )}
                </span>
                {haImporto(s.importoPrevisto) ? (
                  <span className="font-medium text-green-700 whitespace-nowrap">{formattaImporto(s.importoPrevisto)}</span>
                ) : (
                  <span className="text-xs font-medium text-amber-700 whitespace-nowrap" title={IMPORTO_MANCANTE.spiegazione}>
                    Senza importo: esclusa
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between items-center px-3 py-2 bg-gray-100 rounded-lg">
            <span className="font-medium text-gray-900">Totale</span>
            <span className="font-bold text-lg text-green-700">{formattaImporto(totale)}</span>
          </div>
          {senzaImporto > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              {senzaImporto} scadenz{senzaImporto === 1 ? 'a' : 'e'} senza importo non verr{senzaImporto === 1 ? 'à pagata' : 'anno pagate'}:
              completare i dati del veicolo o inserire l'importo, poi registrarle singolarmente.
            </p>
          )}
        </div>

        <div className="space-y-3">
          <Input label="Data del pagamento *" type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} required />
          <Input
            label="Metodo di pagamento"
            value={metodo}
            onChange={(e) => setMetodo(e.target.value)}
            placeholder="es. Bonifico, Contanti, PagoPA..."
          />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose} disabled={inCorso}>
            Annulla
          </Button>
          <Button onClick={conferma} loading={inCorso} disabled={conImporto.length === 0}>
            <CheckCircle size={18} className="mr-2" aria-hidden="true" />
            Conferma pagamento
          </Button>
        </div>
      </div>
    </Modal>
  );
};
