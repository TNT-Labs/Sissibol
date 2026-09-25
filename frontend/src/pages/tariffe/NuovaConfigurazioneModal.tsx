import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { REGIONI_ITALIANE } from '../../constants/domini';
import { useToast } from '../../context/ToastContext';
import { bolloService } from '../../services/bollo.service';
import type { ConfigurazioneBollo } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { leggiImporto } from './tariffe';

interface NuovaConfigurazioneModalProps {
  configurazioni: ConfigurazioneBollo[];
  onClose: () => void;
  onCreata: (configurazione: ConfigurazioneBollo) => void;
}

/** Nuova configurazione vuota per un anno e una regione. Montato solo quando è aperto. */
export const NuovaConfigurazioneModal: React.FC<NuovaConfigurazioneModalProps> = ({
  configurazioni,
  onClose,
  onCreata,
}) => {
  const annoCorrente = new Date().getFullYear();
  // La regione proposta è quella dell'ultima configurazione: lo studio lavora in una sola.
  const [regione, setRegione] = useState(configurazioni[0]?.regione ?? 'Lombardia');
  const [anno, setAnno] = useState(annoCorrente + 1);
  const [sconto, setSconto] = useState('15');
  const [inviato, setInviato] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const toast = useToast();

  // Anche regioni fuori elenco già presenti (es. una configurazione nazionale).
  const regioni = Array.from(new Set([...REGIONI_ITALIANE, ...configurazioni.map((c) => c.regione)])).sort((a, b) =>
    a.localeCompare(b, 'it'),
  );
  const anni = Array.from({ length: 8 }, (_, i) => annoCorrente - 2 + i);
  const esistente = configurazioni.some((c) => c.regione === regione && c.annoValidita === anno);
  const scontoRid = leggiImporto(sconto, 2);
  const erroreSconto = scontoRid === null || scontoRid > 100 ? 'Percentuale da 0 a 100' : undefined;

  const crea = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviato(true);
    if (esistente || erroreSconto || scontoRid === null) return;
    setSalvataggio(true);
    try {
      const creata = await bolloService.createConfigurazione({ annoValidita: anno, regione, scontoRid });
      toast.success('Configurazione creata', `${regione} ${anno}`);
      onCreata(creata);
    } catch (errore) {
      toast.error('Configurazione non creata', getErrorMessage(errore, 'Riprova tra qualche istante.'));
      setSalvataggio(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !salvataggio && onClose()} title="Nuova configurazione" maxWidth="md" closable={!salvataggio}>
      <form onSubmit={crea} className="space-y-4" noValidate>
        <p className="text-sm text-gray-600">
          La configurazione nasce senza tariffe. Per ripartire da quelle di un anno esistente usa «Duplica per un nuovo
          anno».
        </p>
        <SearchableSelect
          label="Regione"
          options={regioni.map((r) => ({ value: r, label: r }))}
          value={regione}
          onChange={(v) => v && setRegione(String(v))}
          disabled={salvataggio}
          required
        />
        <SearchableSelect
          label="Anno di validità"
          options={anni.map((a) => ({ value: a, label: String(a) }))}
          value={anno}
          onChange={(v) => v && setAnno(Number(v))}
          disabled={salvataggio}
          required
        />
        {esistente && (
          <p className="text-sm text-red-600" role="alert">
            Esiste già una configurazione {regione} {anno}.
          </p>
        )}
        <Input
          label="Sconto RID (%)"
          inputMode="decimal"
          autoComplete="off"
          value={sconto}
          onChange={(e) => setSconto(e.target.value)}
          error={inviato ? erroreSconto : undefined}
          disabled={salvataggio}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2 border-t">
          <Button type="button" variant="secondary" onClick={onClose} disabled={salvataggio}>
            Annulla
          </Button>
          <Button type="submit" loading={salvataggio} disabled={esistente}>
            Crea
          </Button>
        </div>
      </form>
    </Modal>
  );
};
