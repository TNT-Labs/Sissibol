import React, { useId, useState } from 'react';
import { Building2, User } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useToast } from '../../context/ToastContext';
import { clientiService } from '../../services/clienti.service';
import { TipoCliente, getClienteDisplayName } from '../../types';
import type { Cliente } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { daCliente, MODULO_VUOTO, versoApi, type ErroriCliente, type ModuloCliente } from './modulo';

interface ClienteModalProps {
  /** Cliente da modificare; null per uno nuovo. */
  cliente: Cliente | null;
  onClose: () => void;
  onSalvato: () => void;
}

/** Interruttore sì/no con etichetta e spiegazione collegate (lettori di schermo). */
const Interruttore: React.FC<{
  etichetta: string;
  spiegazione: string;
  attivo: boolean;
  onCambia: () => void;
  disabled?: boolean;
}> = ({ etichetta, spiegazione, attivo, onCambia, disabled }) => {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-lg">
      <div className="min-w-0">
        <p id={`${id}-etichetta`} className="text-sm font-medium text-gray-900">
          {etichetta}
        </p>
        <p id={`${id}-spiegazione`} className="text-sm text-gray-500">
          {spiegazione}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={attivo}
        aria-labelledby={`${id}-etichetta`}
        aria-describedby={`${id}-spiegazione`}
        onClick={onCambia}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${attivo ? 'bg-green-600' : 'bg-gray-200'}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${attivo ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
};

/** Inserimento e modifica di un cliente. Montato solo quando è aperto. */
export const ClienteModal: React.FC<ClienteModalProps> = ({ cliente, onClose, onSalvato }) => {
  const [modulo, setModulo] = useState<ModuloCliente>(() => (cliente ? daCliente(cliente) : MODULO_VUOTO));
  const [errori, setErrori] = useState<ErroriCliente>({});
  const [salvataggio, setSalvataggio] = useState(false);
  const toast = useToast();
  const idNote = useId();
  const pf = modulo.tipoCliente === TipoCliente.PERSONA_FISICA;

  const imposta = <K extends keyof ModuloCliente>(campo: K, valore: ModuloCliente[K]) => {
    setModulo((prima) => ({ ...prima, [campo]: valore }));
    setErrori((prima) => ({ ...prima, [campo]: undefined }));
  };

  const salva = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvataggio) return;
    const esito = versoApi(modulo, cliente !== null);
    if ('errori' in esito) {
      setErrori(esito.errori);
      return;
    }
    setSalvataggio(true);
    try {
      if (cliente) {
        await clientiService.update(cliente.id, esito.dati);
        toast.success('Cliente aggiornato');
      } else {
        const creato = await clientiService.create(esito.dati as Partial<Cliente>);
        toast.success('Cliente creato', getClienteDisplayName(creato));
      }
      onSalvato();
    } catch (errore) {
      // Prima un messaggio generico: il server dice cosa non va (es. email non valida).
      toast.error('Cliente non salvato', getErrorMessage(errore, 'Riprova tra qualche istante.'));
      setSalvataggio(false);
    }
  };

  const tipo = (valore: TipoCliente, etichetta: string, Icona: typeof User) => (
    <label className="flex items-center cursor-pointer">
      <input
        type="radio"
        name="tipoCliente"
        value={valore}
        checked={modulo.tipoCliente === valore}
        onChange={() => imposta('tipoCliente', valore)}
        disabled={salvataggio}
        className="mr-2"
      />
      <Icona size={16} className="mr-1" aria-hidden="true" />
      {etichetta}
    </label>
  );

  return (
    <Modal
      isOpen
      onClose={() => !salvataggio && onClose()}
      title={cliente ? `Modifica ${getClienteDisplayName(cliente)}` : 'Nuovo cliente'}
      closable={!salvataggio}
    >
      <form onSubmit={salva} className="space-y-4" noValidate>
        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 mb-2">Tipo di cliente</legend>
          <div className="flex flex-wrap gap-4">
            {tipo(TipoCliente.PERSONA_GIURIDICA, 'Persona giuridica', Building2)}
            {tipo(TipoCliente.PERSONA_FISICA, 'Persona fisica', User)}
          </div>
        </fieldset>

        {pf ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Cognome *"
                value={modulo.cognome}
                onChange={(e) => imposta('cognome', e.target.value)}
                error={errori.cognome}
                disabled={salvataggio}
              />
              <Input
                label="Nome *"
                value={modulo.nome}
                onChange={(e) => imposta('nome', e.target.value)}
                error={errori.nome}
                disabled={salvataggio}
              />
            </div>
            <Input
              label="Codice fiscale"
              value={modulo.codiceFiscale}
              onChange={(e) => imposta('codiceFiscale', e.target.value.toUpperCase())}
              maxLength={16}
              autoComplete="off"
              disabled={salvataggio}
            />
          </>
        ) : (
          <>
            <Input
              label="Ragione sociale *"
              value={modulo.ragioneSociale}
              onChange={(e) => imposta('ragioneSociale', e.target.value)}
              error={errori.ragioneSociale}
              disabled={salvataggio}
            />
            <Input
              label="Partita IVA"
              value={modulo.partitaIva}
              onChange={(e) => imposta('partitaIva', e.target.value)}
              maxLength={11}
              inputMode="numeric"
              autoComplete="off"
              disabled={salvataggio}
            />
          </>
        )}

        <Input
          label="Indirizzo"
          value={modulo.indirizzo}
          onChange={(e) => imposta('indirizzo', e.target.value)}
          disabled={salvataggio}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Email"
            type="email"
            value={modulo.email}
            onChange={(e) => imposta('email', e.target.value)}
            error={errori.email}
            disabled={salvataggio}
          />
          <Input
            label="Telefono"
            type="tel"
            value={modulo.telefono}
            onChange={(e) => imposta('telefono', e.target.value)}
            disabled={salvataggio}
          />
        </div>
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

        <Interruttore
          etichetta="Cliente attivo"
          spiegazione="I clienti non attivi non compaiono fra veicoli, scadenze e avvisi"
          attivo={modulo.attivo}
          onCambia={() => imposta('attivo', !modulo.attivo)}
          disabled={salvataggio}
        />
        <Interruttore
          etichetta="Avvisi di scadenza via email"
          spiegazione={
            modulo.avvisiEmail && !modulo.email.trim()
              ? 'Serve un indirizzo email perché gli avvisi possano partire'
              : 'Il cliente riceve un promemoria prima di ogni scadenza del bollo'
          }
          attivo={modulo.avvisiEmail}
          onCambia={() => imposta('avvisiEmail', !modulo.avvisiEmail)}
          disabled={salvataggio}
        />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose} disabled={salvataggio}>
            Annulla
          </Button>
          <Button type="submit" loading={salvataggio}>
            {cliente ? 'Salva' : 'Crea'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
