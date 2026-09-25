import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { useToast } from '../../context/ToastContext';
import { bolloService } from '../../services/bollo.service';
import type { ConfigurazioneBollo } from '../../types';
import { getErrorMessage } from '../../utils/errors';

interface DuplicaConfigurazioneModalProps {
  origine: ConfigurazioneBollo;
  configurazioni: ConfigurazioneBollo[];
  onClose: () => void;
  onDuplicata: (configurazione: ConfigurazioneBollo) => void;
}

/** Copia tariffe ed esenzioni di una configurazione in un nuovo anno. Montato solo quando è aperto. */
export const DuplicaConfigurazioneModal: React.FC<DuplicaConfigurazioneModalProps> = ({
  origine,
  configurazioni,
  onClose,
  onDuplicata,
}) => {
  // Si propongono solo gli anni che per questa regione non esistono ancora.
  const occupati = new Set(configurazioni.filter((c) => c.regione === origine.regione).map((c) => c.annoValidita));
  const primo = Math.max(origine.annoValidita, new Date().getFullYear() - 1);
  const anni = Array.from({ length: 8 }, (_, i) => primo + 1 + i).filter((a) => !occupati.has(a));
  const [anno, setAnno] = useState<number | null>(anni[0] ?? null);
  const [salvataggio, setSalvataggio] = useState(false);
  const toast = useToast();

  const duplica = async (e: React.FormEvent) => {
    e.preventDefault();
    if (anno === null) return;
    setSalvataggio(true);
    try {
      const nuova = await bolloService.duplicaConfigurazione(origine.id, anno);
      toast.success('Configurazione duplicata', `${nuova.regione} ${nuova.annoValidita}: tariffe ed esenzioni copiate.`);
      onDuplicata(nuova);
    } catch (errore) {
      toast.error('Configurazione non duplicata', getErrorMessage(errore, 'Riprova tra qualche istante.'));
      setSalvataggio(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !salvataggio && onClose()} title="Duplica per un nuovo anno" maxWidth="md" closable={!salvataggio}>
      <form onSubmit={duplica} className="space-y-4">
        <p className="text-gray-600">
          Copia tariffe ed esenzioni di <strong>{origine.regione} {origine.annoValidita}</strong> in un nuovo anno. Gli
          importi si possono poi aggiornare uno per uno.
        </p>
        {anni.length > 0 ? (
          <SearchableSelect
            label="Nuovo anno"
            options={anni.map((a) => ({ value: a, label: String(a) }))}
            value={anno ?? ''}
            onChange={(v) => setAnno(v ? Number(v) : null)}
            disabled={salvataggio}
            required
          />
        ) : (
          <p className="text-sm text-gray-600">Esistono già le configurazioni dei prossimi anni per questa regione.</p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2 border-t">
          <Button type="button" variant="secondary" onClick={onClose} disabled={salvataggio}>
            Annulla
          </Button>
          <Button type="submit" loading={salvataggio} disabled={anno === null}>
            Duplica
          </Button>
        </div>
      </form>
    </Modal>
  );
};
