import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ClipboardCheck, Download, Pencil, X } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { Pagination } from '../../components/common/Pagination';
import { SearchInput } from '../../components/common/SearchInput';
import { useToast } from '../../context/ToastContext';
import { useDebounce } from '../../hooks/useDebounce';
import { getErrorMessage } from '../../utils/errors';
import { formattaImporto } from '../../utils/importi';
import { completezzaService } from '../../services/completezza.service';
import type {
  CampoMultiplo,
  ElencoCompletezza,
  FiltroStato,
  ValutazioneVeicolo,
} from '../../services/completezza.service';
import { CAMPI, CAMPI_MULTIPLI, opzioniAssegnabili } from './campi';
import { CompletaVeicoloModal } from './CompletaVeicoloModal';

const PER_PAGINA = 50;

const STATI: Array<{ id: FiltroStato; etichetta: string }> = [
  { id: 'DA_COMPLETARE', etichetta: 'Da completare' },
  { id: 'CONSIGLIATI', etichetta: 'Calcolabili, con dati consigliati' },
  { id: 'TUTTI', etichetta: 'Tutti i veicoli' },
];

const percentuale = (parte: number, totale: number) => (totale ? Math.round((parte / totale) * 1000) / 10 : 0);

/** CSV per Excel in italiano: separatore punto e virgola e BOM UTF-8. */
function scaricaCsv(righe: ValutazioneVeicolo[]) {
  const cella = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const testo = [
    ['Targa', 'Cliente', 'Tipo veicolo', 'Periodicità', 'Dati mancanti', 'Dove trovarli', 'Dati consigliati', 'Problemi tariffario'],
    ...righe.map((r) => [
      r.targa,
      r.cliente,
      r.tipoVeicolo ?? '',
      r.periodicita === 'QUADRIMESTRALE' ? 'Quadrimestrale' : 'Annuale',
      r.mancanti.map((m) => m.etichetta).join(', '),
      r.mancanti.map((m) => m.doveTrovarlo).filter(Boolean).join('; '),
      r.consigliati.map((c) => c.etichetta).join(', '),
      r.tariffario.join('; '),
    ]),
  ]
    .map((riga) => riga.map(cella).join(';'))
    .join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + testo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `dati-veicoli-da-completare-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const Etichette: React.FC<{ riga: ValutazioneVeicolo }> = ({ riga }) => {
  if (riga.esito !== 'NON_CALCOLABILE') {
    return (
      <span className="text-sm text-green-700">
        {riga.esito === 'ESENTE' ? 'Esente' : riga.importo !== null ? formattaImporto(riga.importo) : 'Calcolabile'}
        {riga.consigliati.length > 0 && (
          <span className="text-gray-500"> · manca {riga.consigliati.map((c) => c.etichetta).join(', ')}</span>
        )}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {riga.mancanti.map((m) => (
        <span
          key={m.campo}
          title={m.doveTrovarlo ?? m.messaggio}
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            m.motivo === 'MANCANTE' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {m.motivo === 'DA_RICLASSIFICARE' ? `tipo da riclassificare (${riga.tipoVeicolo})` : m.etichetta}
        </span>
      ))}
      {riga.tariffario.length > 0 && (
        <span
          title={riga.tariffario.join(' ')}
          className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
        >
          problema del tariffario
        </span>
      )}
    </div>
  );
};

export const DatiVeicoliPage: React.FC = () => {
  const toast = useToast();
  const [dati, setDati] = useState<ElencoCompletezza | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [stato, setStato] = useState<FiltroStato>('DA_COMPLETARE');
  const [campo, setCampo] = useState<string>('');
  const [periodicita, setPeriodicita] = useState<'' | 'ANNUALE' | 'QUADRIMESTRALE'>('');
  const [cerca, setCerca] = useState('');
  const cercaRitardata = useDebounce(cerca, 300);
  const [pagina, setPagina] = useState(1);
  const [selezionati, setSelezionati] = useState<Set<number>>(new Set());
  const [aperto, setAperto] = useState<number | null>(null);
  const [campoMultiplo, setCampoMultiplo] = useState<CampoMultiplo>('tipoVeicolo');
  const [valoreMultiplo, setValoreMultiplo] = useState('');
  const [inCorso, setInCorso] = useState(false);

  const filtri = useMemo(
    () => ({
      stato,
      campo: campo || undefined,
      periodicita: periodicita || undefined,
      cerca: cercaRitardata || undefined,
    }),
    [stato, campo, periodicita, cercaRitardata],
  );

  // Solo l'ultima richiesta conta: cambiando filtri in fretta, una risposta
  // più vecchia arrivata dopo non deve sovrascrivere quella giusta.
  const ultimaRichiesta = useRef(0);

  const carica = useCallback(async () => {
    const richiesta = ++ultimaRichiesta.current;
    setCaricamento(true);
    try {
      const risposta = await completezzaService.elenco({ ...filtri, pagina, perPagina: PER_PAGINA });
      if (richiesta === ultimaRichiesta.current) setDati(risposta);
    } catch (error) {
      if (richiesta === ultimaRichiesta.current) {
        toast.error('Errore', getErrorMessage(error, 'Impossibile caricare i dati dei veicoli'));
      }
    } finally {
      if (richiesta === ultimaRichiesta.current) setCaricamento(false);
    }
  }, [filtri, pagina, toast]);

  useEffect(() => {
    void carica();
  }, [carica]);

  // Cambiando filtro si riparte dalla prima pagina e dalla selezione vuota.
  useEffect(() => {
    setPagina(1);
    setSelezionati(new Set());
  }, [filtri]);

  const righe = dati?.righe ?? [];
  const rapporto = dati?.rapporto;
  const tuttiSelezionati = righe.length > 0 && righe.every((r) => selezionati.has(r.idVeicolo));

  const commuta = (id: number) =>
    setSelezionati((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const commutaTutti = () =>
    setSelezionati(tuttiSelezionati ? new Set() : new Set(righe.map((r) => r.idVeicolo)));

  const applicaMultiplo = async () => {
    if (!valoreMultiplo || selezionati.size === 0) return;
    const etichetta = CAMPI[campoMultiplo].etichetta.toLowerCase();
    if (!window.confirm(`Impostare ${etichetta} "${valoreMultiplo}" su ${selezionati.size} veicoli?`)) return;
    setInCorso(true);
    try {
      const esito = await completezzaService.imposta([...selezionati], campoMultiplo, valoreMultiplo);
      toast.success(
        'Dati aggiornati',
        `${esito.aggiornati} veicoli aggiornati` +
          (esito.importiCompletati ? `, ${esito.importiCompletati} scadenze hanno ricevuto l'importo` : '') +
          '.',
      );
      setSelezionati(new Set());
      setValoreMultiplo('');
      await carica();
    } catch (error) {
      toast.error('Errore', getErrorMessage(error, 'Aggiornamento non riuscito'));
    } finally {
      setInCorso(false);
    }
  };

  const esporta = async () => {
    try {
      const tutto = await completezzaService.elenco({ ...filtri, pagina: 1, perPagina: 5000 });
      scaricaCsv(tutto.righe);
    } catch (error) {
      toast.error('Errore', getErrorMessage(error, 'Esportazione non riuscita'));
    }
  };

  // L'ordine di lavoro è fissato all'apertura: un veicolo completato esce
  // dalla lista "da completare", ma il successivo deve restare quello di prima.
  const [coda, setCoda] = useState<number[]>([]);
  const apri = (id: number) => {
    setCoda(righe.map((r) => r.idVeicolo));
    setAperto(id);
  };
  const indiceAperto = aperto === null ? -1 : coda.indexOf(aperto);
  const successivo = indiceAperto >= 0 && indiceAperto < coda.length - 1 ? coda[indiceAperto + 1] : null;
  const chiudiModale = useCallback(() => setAperto(null), []);
  const ricaricaInSilenzio = useCallback(() => {
    const richiesta = ++ultimaRichiesta.current;
    void completezzaService
      .elenco({ ...filtri, pagina, perPagina: PER_PAGINA })
      .then((risposta) => {
        if (richiesta === ultimaRichiesta.current) setDati(risposta);
      })
      .catch(() => undefined);
  }, [filtri, pagina]);

  const pct = rapporto ? percentuale(rapporto.calcolabili, rapporto.totale) : 0;
  const anniSenzaTariffario =
    rapporto && rapporto.anniConTariffario.length > 0
      ? `dal ${Math.max(...rapporto.anniConTariffario) + 1}`
      : null;

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
            <ClipboardCheck className="mr-3 flex-shrink-0" size={32} />
            Dati veicoli
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            I dati della carta di circolazione che servono a calcolare il bollo.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void esporta()} disabled={!dati || dati.totaleRighe === 0}>
          <Download size={18} className="mr-2" />
          Esporta elenco
        </Button>
      </div>

      {rapporto && (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Bollo calcolabile</p>
              <p className="text-2xl sm:text-3xl font-semibold text-gray-900">
                {rapporto.calcolabili} <span className="text-base font-normal text-gray-500">su {rapporto.totale} veicoli</span>
              </p>
            </div>
            <p className="text-sm text-gray-600">
              {rapporto.scadenzeSenzaImporto > 0 ? (
                <>
                  <span className="font-semibold text-amber-700">{rapporto.scadenzeSenzaImporto}</span> scadenze senza
                  importo
                </>
              ) : (
                'Nessuna scadenza senza importo'
              )}
            </p>
          </div>
          <div
            className="h-3 w-full rounded-full bg-gray-100 overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Veicoli con bollo calcolabile"
          >
            <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-gray-500">
            {pct}% del parco attivo. Completando i dati, le scadenze senza importo lo ricevono subito; quelle che
            ne hanno già uno non vengono toccate.
            {anniSenzaTariffario && ` Le scadenze ${anniSenzaTariffario} riceveranno l'importo quando sarà inserito il tariffario di quell'anno.`}
          </p>

          {rapporto.perCampo.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Cosa manca</p>
              <div className="flex flex-wrap gap-2">
                {rapporto.perCampo.map((c) => {
                  const attivo = campo === c.chiave;
                  return (
                    <button
                      key={c.chiave}
                      type="button"
                      title={c.doveTrovarlo ?? undefined}
                      onClick={() => {
                        setCampo(attivo ? '' : c.chiave);
                        if (!attivo) setStato('DA_COMPLETARE');
                      }}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        attivo
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
                      }`}
                      aria-pressed={attivo}
                    >
                      {c.etichetta}
                      <span className={`text-xs font-semibold ${attivo ? 'text-blue-100' : 'text-gray-500'}`}>
                        {c.veicoli}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {rapporto.problemiTariffario.length > 0 && (
            <div className="flex gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
              <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" />
              <div className="min-w-0 space-y-1">
                <p className="font-medium">Problemi del tariffario (non si risolvono sui veicoli)</p>
                {rapporto.problemiTariffario.map((p) => (
                  <p key={p.messaggio}>
                    {p.veicoli} {p.veicoli === 1 ? 'veicolo' : 'veicoli'}: {p.messaggio}
                  </p>
                ))}
                <Link to="/tariffe" className="font-medium text-blue-700 hover:text-blue-900">
                  Vai alle tariffe →
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200 grid grid-cols-1 gap-3 md:grid-cols-[1fr,auto,auto]">
          <SearchInput value={cerca} onChange={setCerca} placeholder="Cerca targa o cliente..." />
          <select
            aria-label="Veicoli da mostrare"
            value={stato}
            onChange={(e) => setStato(e.target.value as FiltroStato)}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
          >
            {STATI.map((s) => (
              <option key={s.id} value={s.id}>
                {s.etichetta}
              </option>
            ))}
          </select>
          <select
            aria-label="Periodicità"
            value={periodicita}
            onChange={(e) => setPeriodicita(e.target.value as typeof periodicita)}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
            title="I veicoli che pagano ogni quattro mesi sono mezzi pesanti da 12 tonnellate in su"
          >
            <option value="">Tutte le periodicità</option>
            <option value="ANNUALE">Annuale</option>
            <option value="QUADRIMESTRALE">Quadrimestrale (mezzi pesanti)</option>
          </select>
        </div>

        {campo && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100 text-sm text-blue-900">
            <span className="min-w-0">
              Veicoli a cui manca: <strong>{CAMPI[campo]?.etichetta.toLowerCase() ?? campo}</strong>
            </span>
            <button
              type="button"
              onClick={() => setCampo('')}
              className="p-1 rounded hover:bg-blue-100 flex-shrink-0"
              aria-label="Rimuovi filtro"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {caricamento && !dati ? (
          <div className="flex justify-center items-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : righe.length === 0 ? (
          <EmptyState
            type="veicoli"
            title={stato === 'DA_COMPLETARE' && !campo && !cerca ? 'Tutti i veicoli sono completi' : 'Nessun veicolo'}
            description={
              stato === 'DA_COMPLETARE' && !campo && !cerca
                ? 'Il bollo è calcolabile per ogni veicolo attivo.'
                : 'Nessun veicolo corrisponde ai filtri.'
            }
          />
        ) : (
          <>
            {/* Desktop */}
            <div className={`hidden md:block overflow-x-auto ${caricamento ? 'opacity-60' : ''}`}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={tuttiSelezionati}
                        onChange={commutaTutti}
                        aria-label="Seleziona tutti i veicoli della pagina"
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </th>
                    {['Targa', 'Cliente', 'Tipo', 'Cosa manca', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {righe.map((r) => (
                    <tr key={r.idVeicolo} className={selezionati.has(r.idVeicolo) ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selezionati.has(r.idVeicolo)}
                          onChange={() => commuta(r.idVeicolo)}
                          aria-label={`Seleziona ${r.targa}`}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{r.targa}</div>
                        {r.periodicita === 'QUADRIMESTRALE' && (
                          <div className="text-xs text-gray-500" title="Paga ogni quattro mesi: mezzo pesante da 12 t in su">
                            quadrimestrale
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 max-w-[14rem] truncate" title={r.cliente}>
                        {r.cliente}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{r.tipoVeicolo ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Etichette riga={r} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => apri(r.idVeicolo)}>
                          <Pencil size={16} className="mr-1.5" />
                          Completa
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className={`md:hidden divide-y divide-gray-200 ${caricamento ? 'opacity-60' : ''}`}>
              <label className="flex items-center gap-3 px-4 py-2 bg-gray-50 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={tuttiSelezionati}
                  onChange={commutaTutti}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Seleziona tutta la pagina
              </label>
              {righe.map((r) => (
                <div key={r.idVeicolo} className={`flex gap-3 px-4 py-3 ${selezionati.has(r.idVeicolo) ? 'bg-blue-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selezionati.has(r.idVeicolo)}
                    onChange={() => commuta(r.idVeicolo)}
                    aria-label={`Seleziona ${r.targa}`}
                    className="h-4 w-4 mt-1 rounded border-gray-300 flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {r.targa}
                          {r.periodicita === 'QUADRIMESTRALE' && (
                            <span className="ml-2 text-xs font-normal text-gray-500">quadrimestrale</span>
                          )}
                        </p>
                        <p className="text-sm text-gray-600 truncate">
                          {r.cliente}
                          {r.tipoVeicolo ? ` · ${r.tipoVeicolo}` : ''}
                        </p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => apri(r.idVeicolo)}>
                        Completa
                      </Button>
                    </div>
                    <Etichette riga={r} />
                  </div>
                </div>
              ))}
            </div>

            {dati && dati.pagine > 1 && (
              <div className="border-t border-gray-200">
                <Pagination
                  page={dati.pagina}
                  totalPages={dati.pagine}
                  total={dati.totaleRighe}
                  pageSize={dati.perPagina}
                  onPageChange={(p) => {
                    setPagina(p);
                    setSelezionati(new Set());
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>

      {selezionati.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 lg:left-64 z-30 border-t border-gray-200 bg-white shadow-lg">
          <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 max-w-6xl mx-auto">
            <p className="text-sm font-medium text-gray-900 whitespace-nowrap">
              {selezionati.size} {selezionati.size === 1 ? 'veicolo selezionato' : 'veicoli selezionati'}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-1 sm:items-center">
              <select
                aria-label="Dato da impostare"
                value={campoMultiplo}
                onChange={(e) => {
                  setCampoMultiplo(e.target.value as CampoMultiplo);
                  setValoreMultiplo('');
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
              >
                {CAMPI_MULTIPLI.map((c) => (
                  <option key={c} value={c}>
                    {CAMPI[c].etichetta}
                  </option>
                ))}
              </select>
              <select
                aria-label="Valore"
                value={valoreMultiplo}
                onChange={(e) => setValoreMultiplo(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm min-w-0 sm:flex-1"
              >
                <option value="">— valore —</option>
                {opzioniAssegnabili(campoMultiplo).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void applicaMultiplo()} disabled={!valoreMultiplo || inCorso} className="flex-1 sm:flex-none">
                {inCorso ? 'Aggiornamento...' : 'Applica'}
              </Button>
              <Button variant="secondary" onClick={() => setSelezionati(new Set())} disabled={inCorso}>
                Annulla
              </Button>
            </div>
          </div>
        </div>
      )}

      <CompletaVeicoloModal
        idVeicolo={aperto}
        onClose={chiudiModale}
        onSalvato={ricaricaInSilenzio}
        onSuccessivo={successivo !== null ? () => setAperto(successivo) : undefined}
      />
    </div>
  );
};
