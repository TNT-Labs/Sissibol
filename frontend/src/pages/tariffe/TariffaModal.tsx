import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useToast } from '../../context/ToastContext';
import { bolloService } from '../../services/bollo.service';
import type { TariffaBollo } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { etichettaUnita, formattaSoglia, importoPerCampo, leggiImporto, soloImportoFisso } from './tariffe';

interface TariffaModalProps {
  tariffa: TariffaBollo;
  onClose: () => void;
  onSalvata: () => void;
}

/** Modifica degli importi di una tariffa (solo amministratori). Montato solo quando è aperto. */
export const TariffaModal: React.FC<TariffaModalProps> = ({ tariffa, onClose, onSalvata }) => {
  const [unitario, setUnitario] = useState(importoPerCampo(tariffa.importoUnitario));
  const [fisso, setFisso] = useState(importoPerCampo(tariffa.importoFisso));
  const [inviato, setInviato] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const toast = useToast();

  // Per le tariffe a importo fisso l'unitario non conta: non si mostra né si invia.
  const soloFisso = soloImportoFisso(tariffa);
  const importoUnitario = leggiImporto(unitario, 4);
  const importoFisso = fisso.trim() === '' ? null : leggiImporto(fisso, 2);
  const erroreUnitario =
    !soloFisso && importoUnitario === null ? 'Inserisci un importo, es. 2,58 (fino a 4 decimali)' : undefined;
  const erroreFisso =
    fisso.trim() === ''
      ? soloFisso
        ? "Inserisci l'importo fisso"
        : undefined
      : importoFisso === null
        ? 'Importo non valido, es. 21,00 (fino a 2 decimali)'
        : undefined;

  const salva = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviato(true);
    if (erroreUnitario || erroreFisso) return;
    setSalvataggio(true);
    try {
      // Campo svuotato: l'importo fisso va tolto (prima restava quello vecchio).
      await bolloService.updateTariffa(
        tariffa.id,
        soloFisso ? { importoFisso } : { importoUnitario: importoUnitario ?? undefined, importoFisso },
      );
      toast.success('Tariffa aggiornata', 'La modifica è registrata nel registro delle modifiche.');
      onSalvata();
    } catch (errore) {
      // Prima l'errore finiva solo nella console e la modifica sembrava salvata.
      toast.error('Tariffa non salvata', getErrorMessage(errore, 'Riprova tra qualche istante.'));
      setSalvataggio(false);
    }
  };

  const unita = etichettaUnita(tariffa.unitaMisura);

  return (
    <Modal isOpen onClose={() => !salvataggio && onClose()} title="Modifica tariffa" maxWidth="md" closable={!salvataggio}>
      <form onSubmit={salva} className="space-y-4" noValidate>
        <dl className="text-sm bg-gray-50 rounded-lg p-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-gray-500">Veicolo</dt>
          <dd className="text-gray-900">{tariffa.tipoVeicolo}</dd>
          {tariffa.categoriaEuro && (
            <>
              <dt className="text-gray-500">Categoria</dt>
              <dd className="text-gray-900">{tariffa.categoriaEuro}</dd>
            </>
          )}
          <dt className="text-gray-500">Scaglione</dt>
          <dd className="text-gray-900">
            {formattaSoglia(tariffa)}
            {tariffa.tipoSospensione && ` (${tariffa.tipoSospensione})`}
          </dd>
          {tariffa.descrizione && (
            <>
              <dt className="text-gray-500">Descrizione</dt>
              <dd className="text-gray-900">{tariffa.descrizione}</dd>
            </>
          )}
        </dl>

        {!soloFisso && (
          <Input
            label={`Importo unitario (€ per ${unita})`}
            inputMode="decimal"
            autoComplete="off"
            value={unitario}
            onChange={(e) => setUnitario(e.target.value)}
            error={inviato ? erroreUnitario : undefined}
            disabled={salvataggio}
            required
          />
        )}
        <Input
          label={soloFisso ? 'Importo fisso (€)' : 'Importo fisso (€, facoltativo)'}
          inputMode="decimal"
          autoComplete="off"
          value={fisso}
          onChange={(e) => setFisso(e.target.value)}
          error={inviato ? erroreFisso : undefined}
          disabled={salvataggio}
          required={soloFisso}
          placeholder={soloFisso ? undefined : 'Nessuno'}
        />

        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          La nuova tariffa vale per i calcoli da ora in poi. Gli importi delle scadenze già create non cambiano:
          si aggiornano con «Ricalcola» nello scadenziario.
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2 border-t">
          <Button type="button" variant="secondary" onClick={onClose} disabled={salvataggio}>
            Annulla
          </Button>
          <Button type="submit" loading={salvataggio}>
            Salva
          </Button>
        </div>
      </form>
    </Modal>
  );
};
