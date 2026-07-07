import React, { useState, useCallback } from 'react';
import { clientiService } from '../../services/clienti.service';
import { scadenzeService } from '../../services/scadenze.service';
import { pagamentiService } from '../../services/pagamenti.service';
import type { Cliente, StatoScadenza, Scadenza, Pagamento } from '../../types';
import { getClienteDisplayName } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import type { SelectOption } from '../../components/common/SearchableSelect';
import { FileText, Download, FileSpreadsheet } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { getMeseLabel } from '../../constants/domini';

// Opzioni per filtro stato
const STATO_FILTER_OPTIONS: SelectOption[] = [
  { value: '', label: 'Tutti gli stati' },
  { value: 'DA_PAGARE', label: 'Da Pagare' },
  { value: 'PAGATO', label: 'Pagato' },
  { value: 'SCADUTO', label: 'Scaduto' },
];

type ReportType = 'scadenze' | 'pagamenti' | 'clienti';

// Soglia per attivare il chunking (numero di record)
const CHUNK_THRESHOLD = 500;

export const ReportPage: React.FC = () => {
  const [reportType, setReportType] = useState<ReportType>('scadenze');
  const [filterCliente, setFilterCliente] = useState<number | undefined>();
  const [filterStato, setFilterStato] = useState<StatoScadenza | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  React.useEffect(() => {
    loadClienti();
  }, []);

  const loadClienti = async () => {
    try {
      const data = await clientiService.getAll();
      setClienti(data);
    } catch (error) {
      console.error('Errore nel caricamento dei clienti:', error);
    }
  };

  /**
   * Genera report PDF scadenze con chunking per grandi dataset.
   * Prima controlla la dimensione totale, poi processa in chunk se necessario.
   */
  const generateScadenzePDF = useCallback(async () => {
    setLoading(true);
    setProgress(null);

    try {
      // Prima ottieni le statistiche per sapere la dimensione totale
      const stats = await scadenzeService.getStats(filterCliente);

      // Se il dataset è piccolo, usa il metodo tradizionale (più veloce)
      if (stats.totale <= CHUNK_THRESHOLD) {
        const scadenze = await scadenzeService.getAll(filterStato || undefined, filterCliente);
        // Calcola il totale dai dati filtrati: stats.importoTotale ignora il filtro stato
        const totale = scadenze.reduce(
          (sum, s) => sum + (s.importoPrevisto ? Number(s.importoPrevisto) : 0),
          0,
        );
        generateScadenzePDFFromData(scadenze, totale);
        return;
      }

      // Per grandi dataset, usa chunking
      const allScadenze: Scadenza[] = [];

      await scadenzeService.iterateAll(
        {
          stato: filterStato || undefined,
          idCliente: filterCliente,
        },
        (chunk, progressInfo) => {
          allScadenze.push(...chunk);
          setProgress(progressInfo);
        },
        CHUNK_THRESHOLD,
      );

      // Calcola importo totale dai dati effettivi
      const totalImporto = allScadenze.reduce(
        (sum, s) => sum + (s.importoPrevisto ? Number(s.importoPrevisto) : 0),
        0,
      );

      generateScadenzePDFFromData(allScadenze, totalImporto);
    } catch (error) {
      console.error('Errore nella generazione del PDF:', error);
      alert('Errore nella generazione del report PDF');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [filterStato, filterCliente, clienti]);

  /**
   * Genera il PDF dalle scadenze già caricate in memoria.
   */
  const generateScadenzePDFFromData = (scadenze: Scadenza[], totalImporto: number) => {
    const doc = new jsPDF();

    // Titolo
    doc.setFontSize(18);
    doc.text('Report Scadenze Bolli', 14, 20);

    // Filtri applicati
    doc.setFontSize(10);
    let yPos = 30;
    doc.text(`Data generazione: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: it })}`, 14, yPos);
    yPos += 6;

    if (filterStato) {
      doc.text(`Stato: ${filterStato.replace('_', ' ')}`, 14, yPos);
      yPos += 6;
    }
    if (filterCliente) {
      const cliente = clienti.find((c) => c.id === filterCliente);
      if (cliente) {
        doc.text(`Cliente: ${getClienteDisplayName(cliente)}`, 14, yPos);
        yPos += 6;
      }
    }

    // Tabella scadenze
    const tableData = scadenze.map((s) => [
      `${getMeseLabel(s.meseScadenza)} ${s.annoScadenza}`,
      s.veicolo?.cliente ? getClienteDisplayName(s.veicolo.cliente) : '-',
      s.veicolo?.targa || '-',
      s.importoPrevisto ? `€ ${s.importoPrevisto}` : '-',
      s.stato.replace('_', ' '),
    ]);

    autoTable(doc, {
      head: [['Scadenza', 'Cliente', 'Veicolo', 'Importo', 'Stato']],
      body: tableData,
      startY: yPos + 5,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    // Totali
    const finalY = (doc as any).lastAutoTable.finalY || yPos + 10;
    doc.setFontSize(10);
    doc.text(`Totale scadenze: ${scadenze.length}`, 14, finalY + 10);
    doc.text(`Importo totale: € ${totalImporto.toFixed(2)}`, 14, finalY + 16);

    doc.save(`report-scadenze-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  /**
   * Genera report PDF pagamenti con chunking per grandi dataset.
   */
  const generatePagamentiPDF = useCallback(async () => {
    setLoading(true);
    setProgress(null);

    try {
      // Per grandi dataset, usa chunking con filtri lato server
      const allPagamenti: Pagamento[] = [];
      let totalImporto = 0;

      const result = await pagamentiService.iterateAll(
        {
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
        (chunk, progressInfo) => {
          allPagamenti.push(...chunk);
          setProgress(progressInfo);
        },
        CHUNK_THRESHOLD,
      );

      totalImporto = result.importoTotale;

      generatePagamentiPDFFromData(allPagamenti, totalImporto);
    } catch (error) {
      console.error('Errore nella generazione del PDF:', error);
      alert('Errore nella generazione del report PDF');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [dateFrom, dateTo]);

  /**
   * Genera il PDF dai pagamenti già caricati in memoria.
   */
  const generatePagamentiPDFFromData = (pagamenti: Pagamento[], totalImporto: number) => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Report Pagamenti', 14, 20);

    doc.setFontSize(10);
    let yPos = 30;
    doc.text(`Data generazione: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: it })}`, 14, yPos);
    yPos += 6;

    if (dateFrom) {
      doc.text(`Dal: ${format(new Date(dateFrom), 'dd/MM/yyyy')}`, 14, yPos);
      yPos += 6;
    }
    if (dateTo) {
      doc.text(`Al: ${format(new Date(dateTo), 'dd/MM/yyyy')}`, 14, yPos);
      yPos += 6;
    }

    const tableData = pagamenti.map((p) => [
      format(new Date(p.dataPagamento), 'dd/MM/yyyy'),
      p.scadenza?.veicolo?.cliente ? getClienteDisplayName(p.scadenza.veicolo.cliente) : '-',
      p.scadenza?.veicolo?.targa || '-',
      `€ ${Number(p.importoPagato).toFixed(2)}`,
      p.metodoPagamento || '-',
    ]);

    autoTable(doc, {
      head: [['Data Pagamento', 'Cliente', 'Veicolo', 'Importo', 'Metodo']],
      body: tableData,
      startY: yPos + 5,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    const finalY = (doc as any).lastAutoTable.finalY || yPos + 10;
    doc.setFontSize(10);
    doc.text(`Totale pagamenti: ${pagamenti.length}`, 14, finalY + 10);
    doc.text(`Importo totale: € ${totalImporto.toFixed(2)}`, 14, finalY + 16);

    doc.save(`report-pagamenti-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const generateClientiPDF = async () => {
    setLoading(true);
    try {
      const clientiData = await clientiService.getAll();

      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.text('Report Clienti', 14, 20);

      doc.setFontSize(10);
      doc.text(
        `Data generazione: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: it })}`,
        14,
        30
      );

      const tableData = clientiData.map((c) => [
        getClienteDisplayName(c),
        c.partitaIva || c.codiceFiscale || '-',
        c.email || '-',
        c.telefono || '-',
        c.veicoli?.length || 0,
      ]);

      autoTable(doc, {
        head: [['Nome/Ragione Sociale', 'P.IVA/C.F.', 'Email', 'Telefono', 'Veicoli']],
        body: tableData,
        startY: 40,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
      });

      const finalY = (doc as any).lastAutoTable.finalY || 50;
      doc.setFontSize(10);
      doc.text(`Totale clienti: ${clientiData.length}`, 14, finalY + 10);

      doc.save(`report-clienti-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (error) {
      console.error('Errore nella generazione del PDF:', error);
      alert('Errore nella generazione del report PDF');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Genera report Excel scadenze con chunking per grandi dataset.
   * Usa XLSX.utils.sheet_add_json per appendere righe incrementalmente.
   */
  const generateScadenzeExcel = useCallback(async () => {
    setLoading(true);
    setProgress(null);

    try {
      // Prima ottieni le statistiche per sapere la dimensione totale
      const stats = await scadenzeService.getStats(filterCliente);

      // Se il dataset è piccolo, usa il metodo tradizionale
      if (stats.totale <= CHUNK_THRESHOLD) {
        const scadenze = await scadenzeService.getAll(filterStato || undefined, filterCliente);
        generateScadenzeExcelFromData(scadenze);
        return;
      }

      // Per grandi dataset, costruisci il foglio incrementalmente
      const wb = XLSX.utils.book_new();
      let ws: XLSX.WorkSheet | null = null;
      let rowOffset = 0;

      await scadenzeService.iterateAll(
        {
          stato: filterStato || undefined,
          idCliente: filterCliente,
        },
        (chunk, progressInfo) => {
          const data = chunk.map((s) => ({
            'Scadenza': `${getMeseLabel(s.meseScadenza)} ${s.annoScadenza}`,
            Cliente: s.veicolo?.cliente ? getClienteDisplayName(s.veicolo.cliente) : '-',
            Veicolo: s.veicolo?.targa || '-',
            'Tipo Veicolo': s.veicolo?.tipoVeicolo || '-',
            'Importo Previsto': s.importoPrevisto || 0,
            Stato: s.stato.replace('_', ' '),
          }));

          if (!ws) {
            // Prima pagina: crea il foglio con header
            ws = XLSX.utils.json_to_sheet(data);
            rowOffset = data.length + 1; // +1 per header
          } else {
            // Pagine successive: appendi senza header
            XLSX.utils.sheet_add_json(ws, data, { skipHeader: true, origin: rowOffset });
            rowOffset += data.length;
          }

          setProgress(progressInfo);
        },
        CHUNK_THRESHOLD,
      );

      if (ws) {
        XLSX.utils.book_append_sheet(wb, ws, 'Scadenze');
        XLSX.writeFile(wb, `report-scadenze-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      }
    } catch (error) {
      console.error('Errore nella generazione Excel:', error);
      alert('Errore nella generazione del report Excel');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [filterStato, filterCliente]);

  /**
   * Genera Excel dalle scadenze già caricate (per piccoli dataset).
   */
  const generateScadenzeExcelFromData = (scadenze: Scadenza[]) => {
    const data = scadenze.map((s) => ({
      'Scadenza': `${getMeseLabel(s.meseScadenza)} ${s.annoScadenza}`,
      Cliente: s.veicolo?.cliente ? getClienteDisplayName(s.veicolo.cliente) : '-',
      Veicolo: s.veicolo?.targa || '-',
      'Tipo Veicolo': s.veicolo?.tipoVeicolo || '-',
      'Importo Previsto': s.importoPrevisto || 0,
      Stato: s.stato.replace('_', ' '),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Scadenze');

    XLSX.writeFile(wb, `report-scadenze-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  /**
   * Genera report Excel pagamenti con chunking per grandi dataset.
   */
  const generatePagamentiExcel = useCallback(async () => {
    setLoading(true);
    setProgress(null);

    try {
      const wb = XLSX.utils.book_new();
      let ws: XLSX.WorkSheet | null = null;
      let rowOffset = 0;

      await pagamentiService.iterateAll(
        {
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
        (chunk, progressInfo) => {
          const data = chunk.map((p) => ({
            'Data Pagamento': format(new Date(p.dataPagamento), 'dd/MM/yyyy'),
            Cliente: p.scadenza?.veicolo?.cliente ? getClienteDisplayName(p.scadenza.veicolo.cliente) : '-',
            Veicolo: p.scadenza?.veicolo?.targa || '-',
            'Importo Pagato': Number(p.importoPagato),
            'Metodo Pagamento': p.metodoPagamento || '-',
          }));

          if (!ws) {
            ws = XLSX.utils.json_to_sheet(data);
            rowOffset = data.length + 1;
          } else {
            XLSX.utils.sheet_add_json(ws, data, { skipHeader: true, origin: rowOffset });
            rowOffset += data.length;
          }

          setProgress(progressInfo);
        },
        CHUNK_THRESHOLD,
      );

      if (ws) {
        XLSX.utils.book_append_sheet(wb, ws, 'Pagamenti');
        XLSX.writeFile(wb, `report-pagamenti-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      }
    } catch (error) {
      console.error('Errore nella generazione Excel:', error);
      alert('Errore nella generazione del report Excel');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [dateFrom, dateTo]);

  const generateClientiExcel = async () => {
    setLoading(true);
    try {
      const clientiData = await clientiService.getAll();

      const data = clientiData.map((c) => ({
        'Nome/Ragione Sociale': getClienteDisplayName(c),
        'P.IVA/C.F.': c.partitaIva || c.codiceFiscale || '-',
        Indirizzo: c.indirizzo || '-',
        Email: c.email || '-',
        Telefono: c.telefono || '-',
        'Numero Veicoli': c.veicoli?.length || 0,
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Clienti');

      XLSX.writeFile(wb, `report-clienti-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    } catch (error) {
      console.error('Errore nella generazione Excel:', error);
      alert('Errore nella generazione del report Excel');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePDF = () => {
    switch (reportType) {
      case 'scadenze':
        generateScadenzePDF();
        break;
      case 'pagamenti':
        generatePagamentiPDF();
        break;
      case 'clienti':
        generateClientiPDF();
        break;
    }
  };

  const handleGenerateExcel = () => {
    switch (reportType) {
      case 'scadenze':
        generateScadenzeExcel();
        break;
      case 'pagamenti':
        generatePagamentiExcel();
        break;
      case 'clienti':
        generateClientiExcel();
        break;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
          <FileText className="mr-3" size={32} />
          Report
        </h1>
      </div>

      {/* Configuration */}
      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Configurazione Report</h2>

          <div className="space-y-4">
            {/* Tipo Report */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo di Report
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => setReportType('scadenze')}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    reportType === 'scadenze'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <h3 className="font-semibold text-gray-900">Scadenze Bolli</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Report delle scadenze per periodo e stato
                  </p>
                </button>
                <button
                  onClick={() => setReportType('pagamenti')}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    reportType === 'pagamenti'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <h3 className="font-semibold text-gray-900">Pagamenti</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Storico pagamenti effettuati
                  </p>
                </button>
                <button
                  onClick={() => setReportType('clienti')}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    reportType === 'clienti'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <h3 className="font-semibold text-gray-900">Clienti</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Anagrafica clienti e veicoli
                  </p>
                </button>
              </div>
            </div>

            {/* Filtri */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reportType === 'scadenze' && (
                <>
                  <SearchableSelect
                    label="Stato"
                    options={STATO_FILTER_OPTIONS}
                    value={filterStato}
                    onChange={(value) => setFilterStato(value as StatoScadenza | '')}
                    placeholder="Filtra per stato..."
                  />
                  <SearchableSelect
                    label="Cliente"
                    options={[
                      { value: '', label: 'Tutti i clienti' },
                      ...clienti.map(c => ({ value: c.id, label: getClienteDisplayName(c) }))
                    ]}
                    value={filterCliente || ''}
                    onChange={(value) => setFilterCliente(value ? Number(value) : undefined)}
                    placeholder="Filtra per cliente..."
                  />
                </>
              )}

              {reportType === 'pagamenti' && (
                <>
                  <Input
                    label="Data Da"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <Input
                    label="Data A"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Progress indicator */}
        {progress && (
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Elaborazione in corso...
              </span>
              <span className="text-sm text-gray-500">
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Export Buttons */}
        <div className="border-t pt-6">
          <h3 className="text-sm font-medium text-gray-700 mb-4">Genera Report</h3>
          <div className="flex space-x-4">
            <Button onClick={handleGeneratePDF} loading={loading} disabled={loading}>
              <Download size={20} className="mr-2" />
              Esporta PDF
            </Button>
            <Button onClick={handleGenerateExcel} variant="secondary" loading={loading} disabled={loading}>
              <FileSpreadsheet size={20} className="mr-2" />
              Esporta Excel
            </Button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Informazioni</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• I report vengono generati in base ai filtri selezionati</li>
          <li>• Il formato PDF è ideale per la stampa e l'archiviazione</li>
          <li>• Il formato Excel permette di elaborare ulteriormente i dati</li>
          <li>• I file vengono scaricati automaticamente nel browser</li>
          <li>• Per grandi dataset, i dati vengono elaborati in blocchi per evitare problemi di memoria</li>
        </ul>
      </div>
    </div>
  );
};
