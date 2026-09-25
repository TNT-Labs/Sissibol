import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CheckCircle, ChevronRight, Info } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { useToast } from '../../context/ToastContext';
import { getErrorMessage } from '../../utils/errors';
import { formattaImporto } from '../../utils/importi';
import { completezzaService } from '../../services/completezza.service';
import type { CampoDaCompletare, ValutazioneVeicolo } from '../../services/completezza.service';
import { veicoliService } from '../../services/veicoli.service';
import type { DatiVeicolo } from '../../services/veicoli.service';
import { CAMPI, interpreta, opzioniAssegnabili } from './campi';

interface Props {
  idVeicolo: number | null;
  /** Veicolo successivo della lista, per lavorare di seguito */
  onSuccessivo?: () => void;
  onClose: () => void;
  /** Chiamata dopo ogni salvataggio, per aggiornare la lista */
  onSalvato: () => void;
}

const testoValore = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));

const CampoInput: React.FC<{
  voce: CampoDaCompletare;
  valore: string;
  valoreAttuale: string | number | null;
  onChange: (valore: string) => void;
}> = ({ voce, valore, valoreAttuale, onChange }) => {
  const def = CAMPI[voce.campo];
  const id = `campo-${voce.campo}`;
  const classe =
    'w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-800">
        {def?.etichetta ?? voce.etichetta}
      </label>
      {voce.motivo !== 'MANCANTE' && (
        <p className="text-xs text-amber-700 mt-0.5">
          {voce.motivo === 'DA_RICLASSIFICARE'
            ? `"${testoValore(valoreAttuale)}" non ha tariffa: scegliere il tipo corretto`
            : `Valore attuale non valido: ${testoValore(valoreAttuale)}`}
        </p>
      )}
      <div className="mt-1 flex items-center gap-2">
        {def?.tipo === 'scelta' ? (
          <select id={id} className={classe} value={valore} onChange={(e) => onChange(e.target.value)}>
            <option value="">— scegliere —</option>
            {opzioniAssegnabili(voce.campo).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : def?.tipo === 'data' ? (
          <input id={id} type="date" className={classe} value={valore} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <>
            <input
              id={id}
              type="text"
              inputMode="decimal"
              className={classe}
              value={valore}
              onChange={(e) => onChange(e.target.value)}
              autoComplete="off"
            />
            {def?.tipo === 'numero' && def.unita && (
              <span className="text-sm text-gray-500 w-8 flex-shrink-0">{def.unita}</span>
            )}
          </>
        )}
      </div>
      {voce.doveTrovarlo && <p className="text-xs text-gray-500 mt-1">{voce.doveTrovarlo}</p>}
    </div>
  );
};

/**
 * Completa i dati di calcolo di un veicolo, un blocco alla volta.
 *
 * Mostra solo ciò che il motore chiede. Dopo ogni salvataggio il veicolo viene
 * rivalutato: un autocarro, per esempio, chiede prima il peso e solo dopo gli
 * assi o la portata. Si prosegue finché il bollo è calcolabile.
 */
export const CompletaVeicoloModal: React.FC<Props> = ({ idVeicolo, onSuccessivo, onClose, onSalvato }) => {
  const toast = useToast();
  const [valutazione, setValutazione] = useState<ValutazioneVeicolo | null>(null);
  const [valori, setValori] = useState<Record<string, string>>({});
  const [errore, setErrore] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const [completati, setCompletati] = useState<number | null>(null);

  // La chiusura passata dal genitore può cambiare a ogni render: non deve
  // far ricaricare il veicolo (si perderebbe l'esito dell'ultimo salvataggio).
  const chiudi = useRef(onClose);
  chiudi.current = onClose;

  const carica = useCallback(
    async (id: number) => {
      try {
        const v = await completezzaService.veicolo(id);
        setValutazione(v);
        // Precompila solo con valori validi: un tipo da riclassificare va scelto.
        setValori(
          Object.fromEntries(
            [...v.mancanti, ...v.consigliati].map((c) => [
              c.campo,
              c.motivo === 'MANCANTE' ? testoValore(v.valori[c.campo]) : '',
            ]),
          ),
        );
      } catch (error) {
        toast.error('Errore', getErrorMessage(error, 'Impossibile caricare il veicolo'));
        chiudi.current();
      }
    },
    [toast],
  );

  useEffect(() => {
    setValutazione(null);
    setErrore(null);
    setCompletati(null);
    if (idVeicolo !== null) void carica(idVeicolo);
  }, [idVeicolo, carica]);

  const salva = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valutazione || salvataggio) return;

    const dati: DatiVeicolo = {};
    for (const [campo, testo] of Object.entries(valori)) {
      const r = interpreta(campo, testo);
      if ('errore' in r) {
        setErrore(r.errore);
        return;
      }
      // In bonifica si aggiungono dati: un campo lasciato vuoto non si svuota.
      if (r.valore !== null && testoValore(valutazione.valori[campo]) !== String(r.valore)) {
        (dati as Record<string, unknown>)[campo] = r.valore;
      }
    }
    if (Object.keys(dati).length === 0) {
      setErrore('Inserire almeno un dato');
      return;
    }

    setErrore(null);
    setSalvataggio(true);
    try {
      const risultato = await veicoliService.update(valutazione.idVeicolo, dati);
      setCompletati((prec) => (prec ?? 0) + (risultato.importiCompletati ?? 0));
      await carica(valutazione.idVeicolo);
      onSalvato();
    } catch (error) {
      setErrore(getErrorMessage(error, 'Salvataggio non riuscito'));
    } finally {
      setSalvataggio(false);
    }
  };

  const calcolabile = valutazione && valutazione.esito !== 'NON_CALCOLABILE';
  const daInserire = valutazione ? [...valutazione.mancanti] : [];
  const consigliati = valutazione?.consigliati ?? [];

  return (
    <Modal
      isOpen={idVeicolo !== null}
      onClose={onClose}
      title={valutazione ? `Dati di ${valutazione.targa}` : 'Dati del veicolo'}
      maxWidth="lg"
    >
      {!valutazione ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <form onSubmit={salva} className="space-y-5">
          <p className="text-sm text-gray-600 -mt-2">
            {valutazione.cliente}
            {valutazione.tipoVeicolo ? ` · ${valutazione.tipoVeicolo}` : ''}
            {valutazione.periodicita === 'QUADRIMESTRALE' ? ' · paga ogni quattro mesi (mezzo pesante)' : ''}
          </p>

          {calcolabile ? (
            <div className="flex gap-3 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-900">
              <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium">
                  Bollo calcolabile
                  {valutazione.esito === 'ESENTE'
                    ? ': veicolo esente'
                    : valutazione.importo !== null
                      ? `: ${formattaImporto(valutazione.importo)}`
                      : ''}
                </p>
                {completati !== null && completati > 0 && (
                  <p>
                    {completati === 1 ? '1 scadenza ha' : `${completati} scadenze hanno`} ricevuto l'importo.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
              <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" />
              <p>
                {daInserire.length > 0
                  ? 'Per calcolare il bollo servono i dati qui sotto. Dopo il salvataggio potrebbero esserne chiesti altri, in base al tipo di veicolo.'
                  : 'Il bollo non è calcolabile per un problema del tariffario, non dei dati del veicolo.'}
              </p>
            </div>
          )}

          {daInserire.length > 0 && (
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-gray-900 mb-2">Dati necessari</legend>
              {daInserire.map((c) => (
                <CampoInput
                  key={c.campo}
                  voce={c}
                  valore={valori[c.campo] ?? ''}
                  valoreAttuale={valutazione.valori[c.campo] ?? null}
                  onChange={(v) => setValori((p) => ({ ...p, [c.campo]: v }))}
                />
              ))}
            </fieldset>
          )}

          {consigliati.length > 0 && (
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-gray-900">Dati consigliati</legend>
              <p className="text-xs text-gray-500 -mt-2">
                Servono a valutare esenzioni e riduzioni (veicoli elettrici, storici).
              </p>
              {consigliati.map((c) => (
                <CampoInput
                  key={c.campo}
                  voce={c}
                  valore={valori[c.campo] ?? ''}
                  valoreAttuale={valutazione.valori[c.campo] ?? null}
                  onChange={(v) => setValori((p) => ({ ...p, [c.campo]: v }))}
                />
              ))}
            </fieldset>
          )}

          {valutazione.tariffario.length > 0 && (
            <div className="flex gap-3 p-3 rounded-lg bg-gray-50 text-sm text-gray-700">
              <Info size={20} className="text-gray-500 flex-shrink-0" />
              <div>
                {valutazione.tariffario.map((t) => (
                  <p key={t}>{t}</p>
                ))}
                <Link to="/tariffe" className="text-blue-600 hover:text-blue-800 font-medium">
                  Vai alle tariffe →
                </Link>
              </div>
            </div>
          )}

          {errore && (
            <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2" role="alert">
              {errore}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Chiudi
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {onSuccessivo && (
                <Button type="button" variant="secondary" onClick={onSuccessivo} disabled={salvataggio}>
                  Veicolo successivo
                  <ChevronRight size={18} className="ml-1" />
                </Button>
              )}
              {(daInserire.length > 0 || consigliati.length > 0) && (
                <Button type="submit" disabled={salvataggio}>
                  {salvataggio ? 'Salvataggio...' : 'Salva e verifica'}
                </Button>
              )}
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
};
