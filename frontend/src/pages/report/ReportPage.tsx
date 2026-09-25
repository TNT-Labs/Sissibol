import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { clientiService } from '../../services/clienti.service';
import { scaricaReport, type FormatoReport, type TipoReport } from '../../services/report.service';
import type { Cliente, StatoScadenza } from '../../types';
import { getClienteDisplayName } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import type { SelectOption } from '../../components/common/SearchableSelect';
import { MESI } from '../../constants/domini';
import { useToast } from '../../context/ToastContext';
import { getErrorMessage } from '../../utils/errors';

const STATI: SelectOption[] = [
  { value: '', label: 'Tutti gli stati' },
  { value: 'DA_PAGARE', label: 'Da pagare' },
  { value: 'SCADUTO', label: 'Scaduto' },
  { value: 'PAGATO', label: 'Pagato' },
];

const OPZIONI_MESI: SelectOption[] = MESI.map((m) => ({ value: m.value, label: m.label }));

const TIPI: { tipo: TipoReport; titolo: string; descrizione: string }[] = [
  { tipo: 'scadenze', titolo: 'Scadenze bolli', descrizione: 'Scadenze di un periodo, per stato e cliente' },
  { tipo: 'pagamenti', titolo: 'Pagamenti', descrizione: 'Pagamenti registrati in un intervallo di date' },
  { tipo: 'clienti', titolo: 'Clienti', descrizione: 'Anagrafica dei clienti attivi con i veicoli' },
];

/** Stesso limite del server (report.controller.ts): oltre, solo Excel. */
const MASSIMO_RIGHE_PDF = 3000;

const PRIMO_ANNO = 1950;

const dueCifre = (n: number) => String(n).padStart(2, '0');

/**
 * Report scaricabili. I file sono generati dal server, che legge i dati a
 * blocchi: il browser riceve solo il file finito, qualunque sia il volume
 * (prima scaricava tutte le righe e costruiva il file da sé, bloccandosi
 * sull'archivio completo).
 */
export const ReportPage: React.FC = () => {
  const annoCorrente = new Date().getFullYear();
  const [tipo, setTipo] = useState<TipoReport>('scadenze');
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [stato, setStato] = useState<StatoScadenza | ''>('');
  const [idCliente, setIdCliente] = useState<number | ''>('');
  const [daMese, setDaMese] = useState(1);
  const [daAnno, setDaAnno] = useState(annoCorrente);
  const [aMese, setAMese] = useState(12);
  const [aAnno, setAAnno] = useState(annoCorrente);
  const [dal, setDal] = useState('');
  const [al, setAl] = useState('');
  const [inCorso, setInCorso] = useState<FormatoReport | null>(null);
  const toast = useToast();

  useEffect(() => {
    clientiService
      .getAll()
      .then(setClienti)
      .catch(() => setClienti([]));
  }, []);

  // Tutto l'arco dell'archivio (scadenze storiche dal 1951, generate fino a
  // decenni avanti); si può digitare l'anno per trovarlo.
  const anni: SelectOption[] = useMemo(
    () =>
      Array.from({ length: annoCorrente + 30 - PRIMO_ANNO + 1 }, (_, i) => PRIMO_ANNO + i).map((a) => ({
        value: a,
        label: String(a),
      })),
    [annoCorrente],
  );

  const opzioniClienti: SelectOption[] = useMemo(
    () => [
      { value: '', label: 'Tutti i clienti' },
      ...clienti
        .map((c) => ({ value: c.id, label: getClienteDisplayName(c) }))
        .sort((x, y) => x.label.localeCompare(y.label, 'it')),
    ],
    [clienti],
  );

  const periodoNonValido = tipo === 'scadenze' && daAnno * 100 + daMese > aAnno * 100 + aMese;
  const dateNonValide = tipo === 'pagamenti' && !!dal && !!al && dal > al;

  const filtri = (): Record<string, string | number | undefined> => {
    if (tipo === 'scadenze') {
      return {
        da: `${daAnno}-${dueCifre(daMese)}`,
        a: `${aAnno}-${dueCifre(aMese)}`,
        stato: stato || undefined,
        idCliente: idCliente || undefined,
      };
    }
    if (tipo === 'pagamenti') return { dal: dal || undefined, al: al || undefined };
    return {};
  };

  const scarica = async (formato: FormatoReport) => {
    setInCorso(formato);
    try {
      await scaricaReport(tipo, formato, filtri());
    } catch (errore) {
      toast.error('Report non generato', getErrorMessage(errore, 'Impossibile generare il report. Riprova.'));
    } finally {
      setInCorso(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
        <FileText className="mr-3" size={30} aria-hidden="true" />
        Report
      </h1>

      <div className="bg-white rounded-lg shadow p-4 sm:p-6 space-y-6">
        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 mb-2">Tipo di report</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {TIPI.map((t) => (
              <button
                key={t.tipo}
                type="button"
                aria-pressed={tipo === t.tipo}
                onClick={() => setTipo(t.tipo)}
                className={`p-4 border-2 rounded-lg text-left transition-colors ${
                  tipo === t.tipo ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="block font-semibold text-gray-900">{t.titolo}</span>
                <span className="block text-sm text-gray-600 mt-1">{t.descrizione}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {tipo === 'scadenze' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <fieldset>
                <legend className="block text-sm font-medium text-gray-700 mb-1">Dal mese</legend>
                {/* Su telefono mese e anno uno sotto l'altro; dai 640px affiancati, anno a larghezza fissa. */}
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
                  <SearchableSelect options={OPZIONI_MESI} value={daMese} onChange={(v) => setDaMese(Number(v) || 1)} placeholder="Mese" />
                  <SearchableSelect options={anni} value={daAnno} onChange={(v) => setDaAnno(Number(v) || annoCorrente)} placeholder="Anno" />
                </div>
              </fieldset>
              <fieldset>
                <legend className="block text-sm font-medium text-gray-700 mb-1">Al mese (compreso)</legend>
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
                  <SearchableSelect options={OPZIONI_MESI} value={aMese} onChange={(v) => setAMese(Number(v) || 12)} placeholder="Mese" />
                  <SearchableSelect options={anni} value={aAnno} onChange={(v) => setAAnno(Number(v) || annoCorrente)} placeholder="Anno" />
                </div>
              </fieldset>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SearchableSelect
                label="Stato"
                options={STATI}
                value={stato}
                onChange={(v) => setStato(v as StatoScadenza | '')}
                placeholder="Tutti gli stati"
              />
              <SearchableSelect
                label="Cliente"
                options={opzioniClienti}
                value={idCliente}
                onChange={(v) => setIdCliente(v ? Number(v) : '')}
                placeholder="Tutti i clienti"
              />
            </div>
            {periodoNonValido && (
              <p className="text-sm text-red-700" role="alert">
                Il mese iniziale è successivo a quello finale.
              </p>
            )}
          </div>
        )}

        {tipo === 'pagamenti' && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Dal" type="date" value={dal} onChange={(e) => setDal(e.target.value)} />
              <Input label="Al (compreso)" type="date" value={al} onChange={(e) => setAl(e.target.value)} />
            </div>
            <p className="text-sm text-gray-500">Senza date: tutti i pagamenti registrati.</p>
            {dateNonValide && (
              <p className="text-sm text-red-700" role="alert">
                La data iniziale è successiva a quella finale.
              </p>
            )}
          </div>
        )}

        <div className="border-t pt-6 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => scarica('xlsx')}
              loading={inCorso === 'xlsx'}
              disabled={inCorso !== null || periodoNonValido || dateNonValide}
            >
              <FileSpreadsheet size={20} className="mr-2" aria-hidden="true" />
              Scarica Excel
            </Button>
            <Button
              variant="secondary"
              onClick={() => scarica('pdf')}
              loading={inCorso === 'pdf'}
              disabled={inCorso !== null || periodoNonValido || dateNonValide}
            >
              <Download size={20} className="mr-2" aria-hidden="true" />
              Scarica PDF
            </Button>
          </div>
          <p className="text-sm text-gray-500">
            Excel contiene tutte le colonne ed è adatto a qualsiasi volume. Il PDF, pensato per la stampa, è limitato a{' '}
            {MASSIMO_RIGHE_PDF.toLocaleString('it-IT')} righe. Gli importi mancanti non sono conteggiati come zero: il
            riepilogo li indica a parte. Ogni esportazione viene annotata nel registro delle attività.
          </p>
        </div>
      </div>
    </div>
  );
};
