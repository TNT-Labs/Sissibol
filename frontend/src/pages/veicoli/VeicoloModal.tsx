import React, { useId, useMemo, useState } from 'react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { useToast } from '../../context/ToastContext';
import { veicoliService } from '../../services/veicoli.service';
import { getClienteDisplayName } from '../../types';
import type { Cliente, Veicolo } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import {
  cambiaTipo,
  campiTecniciVisibili,
  daVeicolo,
  MODULO_VUOTO,
  opzioniCampo,
  tipoSenzaTariffa,
  versoApi,
  type ErroriModulo,
  type ModuloVeicolo,
} from './modulo';

interface VeicoloModalProps {
  /** Veicolo completo da modificare; null per uno nuovo. */
  veicolo: Veicolo | null;
  clienti: Cliente[];
  onClose: () => void;
  onSalvato: () => void;
}

const ETICHETTE_TECNICHE: Record<string, { etichetta: string; esempio: string }> = {
  potenzaKw: { etichetta: 'Potenza (kW)', esempio: 'es. 85,5' },
  cilindrata: { etichetta: 'Cilindrata (cc)', esempio: 'es. 1600' },
  portataKg: { etichetta: 'Portata (kg)', esempio: 'es. 3500' },
  pesoComplessivoKg: { etichetta: 'Peso complessivo (kg)', esempio: 'es. 12000' },
  numeroPosti: { etichetta: 'Numero di posti', esempio: 'es. 40' },
  massaRimorchiabileKg: { etichetta: 'Massa rimorchiabile (kg)', esempio: 'es. 40000' },
};

const ASSI = [
  { value: '2', label: '2 assi' },
  { value: '3', label: '3 assi' },
  { value: '4', label: '4 o più assi' },
];

const ErroreCampo: React.FC<{ testo?: string }> = ({ testo }) =>
  testo ? <p className="mt-1 text-sm text-red-600">{testo}</p> : null;

/** Inserimento e modifica di un veicolo. Montato solo quando è aperto. */
export const VeicoloModal: React.FC<VeicoloModalProps> = ({ veicolo, clienti, onClose, onSalvato }) => {
  const [modulo, setModulo] = useState<ModuloVeicolo>(() => (veicolo ? daVeicolo(veicolo) : MODULO_VUOTO));
  const [errori, setErrori] = useState<ErroriModulo>({});
  const [salvataggio, setSalvataggio] = useState(false);
  const toast = useToast();
  const idNote = useId();

  // Si assegnano solo clienti attivi; quello attuale resta anche se non lo è più.
  const opzioniClienti = useMemo(
    () =>
      clienti
        .filter((c) => c.attivo || c.id === veicolo?.idCliente)
        .map((c) => ({ value: c.id, label: getClienteDisplayName(c) + (c.attivo ? '' : ' (non attivo)') })),
    [clienti, veicolo?.idCliente],
  );

  const imposta = <K extends keyof ModuloVeicolo>(campo: K, valore: ModuloVeicolo[K]) => {
    setModulo((prima) => ({ ...prima, [campo]: valore }));
    setErrori((prima) => ({ ...prima, [campo]: undefined }));
  };

  const salva = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvataggio) return;
    const esito = versoApi(modulo, veicolo);
    if ('errori' in esito) {
      setErrori(esito.errori);
      return;
    }
    setSalvataggio(true);
    try {
      if (veicolo) {
        const aggiornato = await veicoliService.update(veicolo.id, esito.dati);
        const n = aggiornato.importiCompletati ?? 0;
        toast.success(
          'Veicolo aggiornato',
          n > 0 ? `${n === 1 ? '1 scadenza ha' : `${n} scadenze hanno`} ricevuto l'importo del bollo.` : undefined,
        );
      } else {
        await veicoliService.create(esito.dati as Partial<Veicolo>);
        toast.success('Veicolo creato', esito.dati.targa ?? undefined);
      }
      onSalvato();
    } catch (errore) {
      toast.error('Salvataggio non riuscito', getErrorMessage(errore, 'Controllare i dati inseriti'));
      setSalvataggio(false);
    }
  };

  const tecnici = campiTecniciVisibili(modulo.tipoVeicolo);
  const scelta = (campo: 'tipoVeicolo' | 'classeAmbientale' | 'alimentazione' | 'regione' | 'tipoSospensione') =>
    opzioniCampo(campo, modulo[campo]);

  return (
    <Modal
      isOpen
      onClose={() => !salvataggio && onClose()}
      title={veicolo ? `Modifica veicolo ${veicolo.targa}` : 'Nuovo veicolo'}
      closable={!salvataggio}
    >
      <form onSubmit={salva} className="space-y-6" noValidate>
        <section>
          <h3 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b">Dati principali</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <SearchableSelect
                label="Cliente"
                options={opzioniClienti}
                value={modulo.idCliente ?? ''}
                onChange={(v) => imposta('idCliente', v ? Number(v) : null)}
                placeholder="Cerca cliente..."
                disabled={salvataggio}
                required
              />
              <ErroreCampo testo={errori.idCliente} />
            </div>
            <Input
              label="Targa *"
              value={modulo.targa}
              onChange={(e) => imposta('targa', e.target.value.toUpperCase())}
              error={errori.targa}
              placeholder="AA123BB"
              autoComplete="off"
              maxLength={12}
              disabled={salvataggio}
            />
          </div>
        </section>

        <section>
          <h3 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b">Classificazione</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <SearchableSelect
                label="Tipo di veicolo"
                options={scelta('tipoVeicolo')}
                value={modulo.tipoVeicolo}
                onChange={(v) => setModulo((prima) => cambiaTipo(prima, String(v)))}
                placeholder="Seleziona o cerca..."
                disabled={salvataggio}
              />
              {tipoSenzaTariffa(modulo.tipoVeicolo) && (
                <p className="mt-1 text-sm text-amber-700">Tipo dell'archivio senza tariffa: sceglierne uno dell'elenco.</p>
              )}
            </div>
            <SearchableSelect
              label="Classe ambientale"
              options={scelta('classeAmbientale')}
              value={modulo.classeAmbientale}
              onChange={(v) => imposta('classeAmbientale', String(v))}
              placeholder="Seleziona o cerca..."
              disabled={salvataggio}
            />
            <SearchableSelect
              label="Alimentazione"
              options={scelta('alimentazione')}
              value={modulo.alimentazione}
              onChange={(v) => imposta('alimentazione', String(v))}
              placeholder="Seleziona o cerca..."
              disabled={salvataggio}
            />
            <SearchableSelect
              label="Regione"
              options={scelta('regione')}
              value={modulo.regione}
              onChange={(v) => imposta('regione', String(v))}
              placeholder="Seleziona o cerca..."
              disabled={salvataggio}
            />
            <Input
              label="Data di immatricolazione"
              type="date"
              value={modulo.dataImmatricolazione}
              onChange={(e) => imposta('dataImmatricolazione', e.target.value)}
              disabled={salvataggio}
            />
          </div>
        </section>

        {tecnici.length > 0 && (
          <section>
            <h3 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b">Dati per il calcolo del bollo</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tecnici.map((campo) =>
                campo === 'numeroAssi' ? (
                  <div key={campo}>
                    <SearchableSelect
                      label="Numero di assi"
                      options={ASSI}
                      value={modulo.numeroAssi}
                      onChange={(v) => imposta('numeroAssi', String(v))}
                      placeholder="Seleziona..."
                      disabled={salvataggio}
                    />
                    <ErroreCampo testo={errori.numeroAssi} />
                  </div>
                ) : campo === 'tipoSospensione' ? (
                  <SearchableSelect
                    key={campo}
                    label="Sospensioni"
                    options={scelta('tipoSospensione')}
                    value={modulo.tipoSospensione}
                    onChange={(v) => imposta('tipoSospensione', String(v))}
                    placeholder="Seleziona..."
                    disabled={salvataggio}
                  />
                ) : (
                  <Input
                    key={campo}
                    label={ETICHETTE_TECNICHE[campo].etichetta}
                    inputMode={campo === 'potenzaKw' ? 'decimal' : 'numeric'}
                    autoComplete="off"
                    value={modulo[campo]}
                    onChange={(e) => imposta(campo, e.target.value)}
                    error={errori[campo]}
                    placeholder={ETICHETTE_TECNICHE[campo].esempio}
                    disabled={salvataggio}
                  />
                ),
              )}
            </div>
          </section>
        )}

        <div>
          <label htmlFor={idNote} className="block text-sm font-medium text-gray-700 mb-1">
            Note
          </label>
          <textarea
            id={idNote}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            value={modulo.note}
            onChange={(e) => imposta('note', e.target.value)}
            disabled={salvataggio}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose} disabled={salvataggio}>
            Annulla
          </Button>
          <Button type="submit" loading={salvataggio}>
            {veicolo ? 'Salva' : 'Crea'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
