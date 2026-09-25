import React, { useCallback, useMemo, useState } from 'react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import type { SelectOption } from '../../components/common/SearchableSelect';
import { RicercaRemota } from '../../components/common/RicercaRemota';
import { MESI } from '../../constants/domini';
import { useToast } from '../../context/ToastContext';
import { scadenzeService } from '../../services/scadenze.service';
import { veicoliService } from '../../services/veicoli.service';
import { Periodicita, StatoScadenza, getClienteDisplayName } from '../../types';
import type { Scadenza } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { ETICHETTA_STATO } from './stati';

const MESI_OPZIONI: SelectOption[] = MESI.map((m) => ({ value: m.value, label: m.label }));
const PERIODICITA: SelectOption[] = [
  { value: Periodicita.ANNUALE, label: 'Annuale (12 mesi)' },
  { value: Periodicita.QUADRIMESTRALE, label: 'Quadrimestrale (4 mesi)' },
];
const STATI: SelectOption[] = [StatoScadenza.DA_PAGARE, StatoScadenza.PAGATO, StatoScadenza.SCADUTO].map((s) => ({
  value: s,
  label: ETICHETTA_STATO[s],
}));

interface ScadenzaModalProps {
  /** Scadenza da modificare; assente per una nuova. */
  scadenza: Scadenza | null;
  /** Mese e anno proposti per una nuova scadenza. */
  mese: number;
  anno: number;
  onClose: () => void;
  onSalvata: () => void;
}

/** Nuova scadenza o modifica di una esistente. Montato solo quando è aperto. */
export const ScadenzaModal: React.FC<ScadenzaModalProps> = ({ scadenza, mese, anno, onClose, onSalvata }) => {
  const toast = useToast();
  const [salvataggio, setSalvataggio] = useState(false);
  const [veicolo, setVeicolo] = useState<SelectOption | null>(
    scadenza
      ? {
          value: scadenza.idVeicolo,
          label: `${scadenza.veicolo?.targa ?? ''} · ${scadenza.veicolo?.cliente ? getClienteDisplayName(scadenza.veicolo.cliente) : ''}`,
        }
      : null, // Nessun veicolo preselezionato: va cercato e scelto.
  );
  const [dati, setDati] = useState({
    meseScadenza: scadenza?.meseScadenza ?? mese,
    annoScadenza: scadenza?.annoScadenza ?? anno,
    periodicita: scadenza?.periodicita ?? Periodicita.ANNUALE,
    importoPrevisto: scadenza?.importoPrevisto?.toString() ?? '',
    stato: scadenza?.stato ?? StatoScadenza.DA_PAGARE,
  });

  const annoCorrente = new Date().getFullYear();
  const anni: SelectOption[] = useMemo(() => {
    // Anni proposti: dal corrente ai prossimi dieci, più quello della scadenza se diverso.
    const elenco = Array.from({ length: 10 }, (_, i) => annoCorrente + i);
    if (!elenco.includes(dati.annoScadenza)) elenco.unshift(dati.annoScadenza);
    return elenco.map((a) => ({ value: a, label: String(a) }));
  }, [annoCorrente, dati.annoScadenza]);

  const cercaVeicoli = useCallback(async (testo: string): Promise<SelectOption[]> => {
    const risultato = await veicoliService.getAllPaginated({ search: testo || undefined, pageSize: 20 });
    return risultato.data.map((v) => ({
      value: v.id,
      label: `${v.targa} · ${v.cliente ? getClienteDisplayName(v.cliente) : 'cliente non indicato'}`,
    }));
  }, []);

  const salva = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvataggio) return;
    if (!veicolo) {
      toast.error('Veicolo mancante', 'Cerca e scegli il veicolo della scadenza.');
      return;
    }
    const importo = dati.importoPrevisto.trim() === '' ? undefined : Number(dati.importoPrevisto.replace(',', '.'));
    if (importo !== undefined && (!Number.isFinite(importo) || importo < 0)) {
      toast.error('Importo non valido', 'Indica un importo in euro, oppure lascia vuoto per calcolarlo dal tariffario.');
      return;
    }
    setSalvataggio(true);
    try {
      const corpo = {
        idVeicolo: Number(veicolo.value),
        meseScadenza: dati.meseScadenza,
        annoScadenza: dati.annoScadenza,
        periodicita: dati.periodicita,
        importoPrevisto: importo,
        stato: dati.stato,
      };
      if (scadenza) await scadenzeService.update(scadenza.id, corpo);
      else await scadenzeService.create(corpo);
      toast.success(scadenza ? 'Scadenza aggiornata' : 'Scadenza creata');
      onSalvata();
    } catch (errore) {
      // Prima l'errore finiva solo nella console: l'operatore non sapeva che il salvataggio era fallito.
      toast.error('Scadenza non salvata', getErrorMessage(errore, 'Riprova tra qualche istante.'));
    } finally {
      setSalvataggio(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={scadenza ? 'Modifica scadenza' : 'Nuova scadenza'}>
      <form onSubmit={salva} className="space-y-4">
        <RicercaRemota
          label="Veicolo"
          valore={veicolo}
          onChange={setVeicolo}
          cerca={cercaVeicoli}
          placeholder="Cerca per targa o cliente..."
          required
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SearchableSelect
            label="Mese"
            options={MESI_OPZIONI}
            value={dati.meseScadenza}
            onChange={(v) => v && setDati({ ...dati, meseScadenza: Number(v) })}
            required
          />
          <SearchableSelect
            label="Anno"
            options={anni}
            value={dati.annoScadenza}
            onChange={(v) => v && setDati({ ...dati, annoScadenza: Number(v) })}
            required
          />
        </div>
        <SearchableSelect
          label="Periodicità"
          options={PERIODICITA}
          value={dati.periodicita}
          onChange={(v) => v && setDati({ ...dati, periodicita: v as Periodicita })}
          required
        />
        <div>
          <Input
            label="Importo previsto (€)"
            type="text"
            inputMode="decimal"
            value={dati.importoPrevisto}
            onChange={(e) => setDati({ ...dati, importoPrevisto: e.target.value })}
            placeholder="es. 150,00"
          />
          <p className="mt-1 text-sm text-gray-500">Vuoto: calcolato dal tariffario in base ai dati del veicolo.</p>
        </div>
        <SearchableSelect
          label="Stato"
          options={STATI}
          value={dati.stato}
          onChange={(v) => v && setDati({ ...dati, stato: v as StatoScadenza })}
          required
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={salvataggio}>
            Annulla
          </Button>
          <Button type="submit" loading={salvataggio}>
            {scadenza ? 'Salva' : 'Crea'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
