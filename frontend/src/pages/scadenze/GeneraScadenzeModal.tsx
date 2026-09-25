import React, { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { scadenzeService } from '../../services/scadenze.service';
import { getErrorMessage } from '../../utils/errors';
import { IMPORTO_MANCANTE } from '../../utils/importi';

type Esito = Awaited<ReturnType<typeof scadenzeService.generaScadenzeFuture>>;

interface GeneraScadenzeModalProps {
  onClose: () => void;
  /** Chiamata dopo una generazione (riuscita o no): lo scadenziario va ricaricato. */
  onGenerate: () => void;
}

/** Generazione delle scadenze future per tutti i veicoli. Montato solo quando è aperto. */
export const GeneraScadenzeModal: React.FC<GeneraScadenzeModalProps> = ({ onClose, onGenerate }) => {
  const annoCorrente = new Date().getFullYear();
  const [annoFinale, setAnnoFinale] = useState(annoCorrente + 1);
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<Esito | null>(null);
  const anni = Array.from({ length: 10 }, (_, i) => ({ value: annoCorrente + i, label: String(annoCorrente + i) }));

  const genera = async () => {
    setInCorso(true);
    try {
      setEsito(await scadenzeService.generaScadenzeFuture(annoFinale));
    } catch (errore) {
      setEsito({
        veicoliProcessati: 0,
        scadenzeCreate: 0,
        scadenzeSaltate: 0,
        scadenzeSenzaImporto: 0,
        errori: [getErrorMessage(errore, 'Errore sconosciuto')],
      });
    } finally {
      setInCorso(false);
      onGenerate();
    }
  };

  return (
    <Modal isOpen onClose={() => !inCorso && onClose()} title="Genera scadenze future" maxWidth="lg" closable={!inCorso}>
      <div className="space-y-4">
        {!esito ? (
          <>
            <p className="text-gray-600">
              Crea le scadenze di tutti i veicoli attivi fino all'anno scelto. Quelle già esistenti non vengono
              duplicate.
            </p>
            <SearchableSelect
              label="Fino all'anno (compreso)"
              options={anni}
              value={annoFinale}
              onChange={(v) => v && setAnnoFinale(Number(v))}
              disabled={inCorso}
            />
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-800 mb-2">Come funziona</h3>
              <ul className="text-sm text-blue-700 space-y-1 list-disc pl-5">
                <li>Il mese di scadenza segue la data di immatricolazione</li>
                <li>Annuale: una scadenza nel mese di immatricolazione</li>
                <li>Quadrimestrale: tre scadenze l'anno, ogni 4 mesi</li>
                <li>L'importo è calcolato dal tariffario; se mancano dati resta da calcolare</li>
                <li>Veicoli senza data di immatricolazione: si usano le scadenze esistenti come riferimento</li>
              </ul>
            </div>
          </>
        ) : (
          <>
            <div
              className={`p-4 rounded-lg border ${esito.scadenzeCreate > 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
            >
              <h3 className={`font-semibold mb-3 ${esito.scadenzeCreate > 0 ? 'text-green-800' : 'text-gray-800'}`}>
                Risultato
              </h3>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <dd className="text-2xl font-bold text-gray-900">{esito.veicoliProcessati}</dd>
                  <dt className="text-sm text-gray-600">Veicoli esaminati</dt>
                </div>
                <div>
                  <dd className="text-2xl font-bold text-green-600">{esito.scadenzeCreate}</dd>
                  <dt className="text-sm text-gray-600">Scadenze create</dt>
                </div>
                <div>
                  <dd className="text-2xl font-bold text-gray-500">{esito.scadenzeSaltate}</dd>
                  <dt className="text-sm text-gray-600">Già esistenti</dt>
                </div>
                <div title={IMPORTO_MANCANTE.spiegazione}>
                  <dd className={`text-2xl font-bold ${esito.scadenzeSenzaImporto > 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                    {esito.scadenzeSenzaImporto}
                  </dd>
                  <dt className="text-sm text-gray-600">Senza importo</dt>
                </div>
              </dl>
            </div>
            {esito.errori.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4" role="alert">
                <h3 className="font-medium text-red-800 mb-2">Errori ({esito.errori.length})</h3>
                <ul className="text-sm text-red-700 space-y-1 max-h-32 overflow-y-auto list-disc pl-5">
                  {esito.errori.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2 border-t">
          {!esito ? (
            <>
              <Button variant="secondary" onClick={onClose} disabled={inCorso}>
                Annulla
              </Button>
              <Button onClick={genera} loading={inCorso}>
                <Wand2 size={18} className="mr-2" aria-hidden="true" />
                {inCorso ? 'Generazione in corso...' : 'Genera scadenze'}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>Chiudi</Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
