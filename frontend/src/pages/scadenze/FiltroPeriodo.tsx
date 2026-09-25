import React, { useMemo } from 'react';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import type { SelectOption } from '../../components/common/SearchableSelect';
import { MESI } from '../../constants/domini';

const MESI_OPZIONI: SelectOption[] = MESI.map((m) => ({ value: m.value, label: m.label }));

interface FiltroPeriodoProps {
  mese: number;
  anno: number;
  onChange: (mese: number, anno: number) => void;
  /** Riepilogo a destra (es. numero di veicoli in scadenza). */
  riepilogo?: React.ReactNode;
}

/** Scelta del mese dello scadenziario. */
export const FiltroPeriodo: React.FC<FiltroPeriodoProps> = ({ mese, anno, onChange, riepilogo }) => {
  const annoCorrente = new Date().getFullYear();
  // Dal primo anno dell'archivio a quelli già generati in avanti; si può
  // digitare l'anno per trovarlo. Prima erano solo 5 anni attorno a quello corrente.
  const anni: SelectOption[] = useMemo(
    () =>
      Array.from({ length: annoCorrente + 30 - 1950 + 1 }, (_, i) => 1950 + i).map((a) => ({ value: a, label: String(a) })),
    [annoCorrente],
  );

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-48">
          <SearchableSelect
            label="Mese"
            options={MESI_OPZIONI}
            value={mese}
            onChange={(v) => v && onChange(Number(v), anno)}
            placeholder="Mese"
          />
        </div>
        <div className="w-full sm:w-36">
          <SearchableSelect
            label="Anno"
            options={anni}
            value={anno}
            onChange={(v) => v && onChange(mese, Number(v))}
            placeholder="Anno"
          />
        </div>
        <div className="hidden sm:block flex-1" />
        {riepilogo && <div className="text-sm text-gray-600 pb-2">{riepilogo}</div>}
      </div>
    </div>
  );
};
