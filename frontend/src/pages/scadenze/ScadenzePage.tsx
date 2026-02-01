import React, { useEffect, useState, useMemo } from 'react';
import { scadenzeService } from '../../services/scadenze.service';
import { veicoliService } from '../../services/veicoli.service';
import { StatoScadenza, Periodicita, getClienteDisplayName } from '../../types';
import type { Scadenza, Cliente, Veicolo } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Plus, X, Calendar as CalendarIcon, ChevronDown, ChevronRight, Car, Edit, Trash2, Calculator, Wand2 } from 'lucide-react';
import { MESI, getMeseLabel } from '../../constants/domini';

// Calcola il mese successivo
const getNextMonth = () => {
  const oggi = new Date();
  let mese = oggi.getMonth() + 2; // +1 per 0-indexed, +1 per mese successivo
  let anno = oggi.getFullYear();
  if (mese > 12) {
    mese = 1;
    anno++;
  }
  return { mese, anno };
};

interface ClienteConScadenze {
  cliente: Cliente;
  scadenze: Scadenza[];
  veicoliCount: number;
}

export const ScadenzePage: React.FC = () => {
  const [scadenze, setScadenze] = useState<Scadenza[]>([]);
  const [veicoli, setVeicoli] = useState<Veicolo[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtro mese/anno - default mese successivo
  const defaultPeriod = getNextMonth();
  const [meseSelezionato, setMeseSelezionato] = useState(defaultPeriod.mese);
  const [annoSelezionato, setAnnoSelezionato] = useState(defaultPeriod.anno);

  // Clienti espansi
  const [expandedClienti, setExpandedClienti] = useState<Set<number>>(new Set());

  // Modal per nuova/modifica scadenza
  const [showModal, setShowModal] = useState(false);
  const [editingScadenza, setEditingScadenza] = useState<Scadenza | null>(null);

  // Modal per generazione scadenze future
  const [showGeneraModal, setShowGeneraModal] = useState(false);
  const [annoTarget, setAnnoTarget] = useState(new Date().getFullYear() + 1);
  const [generaLoading, setGeneraLoading] = useState(false);
  const [generaResult, setGeneraResult] = useState<{
    veicoliProcessati: number;
    scadenzeCreate: number;
    scadenzeSaltate: number;
    errori: string[];
  } | null>(null);

  const [formData, setFormData] = useState<{
    idVeicolo: number;
    meseScadenza: number;
    annoScadenza: number;
    periodicita: Periodicita;
    importoPrevisto: string;
    stato: StatoScadenza;
  }>({
    idVeicolo: 0,
    meseScadenza: defaultPeriod.mese,
    annoScadenza: defaultPeriod.anno,
    periodicita: Periodicita.ANNUALE,
    importoPrevisto: '',
    stato: StatoScadenza.DA_PAGARE,
  });

  // Carica veicoli una volta sola (per il modal)
  useEffect(() => {
    loadVeicoli();
  }, []);

  // Ricarica scadenze quando cambia mese/anno
  useEffect(() => {
    loadScadenze();
  }, [meseSelezionato, annoSelezionato]);

  const loadVeicoli = async () => {
    try {
      const veicoliData = await veicoliService.getAll();
      setVeicoli(veicoliData);
    } catch (error) {
      console.error('Errore nel caricamento dei veicoli:', error);
    }
  };

  const loadScadenze = async () => {
    setLoading(true);
    try {
      // Carica solo le scadenze del mese/anno selezionato (ottimizzato)
      const scadenzeData = await scadenzeService.getByMeseAnno(meseSelezionato, annoSelezionato);
      setScadenze(scadenzeData);
    } catch (error) {
      console.error('Errore nel caricamento delle scadenze:', error);
    } finally {
      setLoading(false);
    }
  };

  // Raggruppa scadenze per cliente (già filtrate dal server)
  const clientiConScadenze = useMemo((): ClienteConScadenze[] => {
    const clienteMap = new Map<number, ClienteConScadenze>();

    scadenze.forEach((scadenza) => {
      const clienteId = scadenza.veicolo?.cliente?.id;
      // Se non c'è cliente associato, usa un ID fittizio per raggruppare
      const effectiveClienteId = clienteId || -1;

      if (!clienteMap.has(effectiveClienteId)) {
        clienteMap.set(effectiveClienteId, {
          cliente: scadenza.veicolo?.cliente || {
            id: -1,
            tipoCliente: 'PERSONA_GIURIDICA' as any,
            ragioneSociale: 'Cliente non associato',
          } as Cliente,
          scadenze: [],
          veicoliCount: 0,
        });
      }

      const entry = clienteMap.get(effectiveClienteId)!;
      entry.scadenze.push(scadenza);
      entry.veicoliCount = entry.scadenze.length;
    });

    // Ordina per nome cliente
    return Array.from(clienteMap.values()).sort((a, b) =>
      getClienteDisplayName(a.cliente).localeCompare(getClienteDisplayName(b.cliente))
    );
  }, [scadenze]);

  const toggleExpanded = (clienteId: number) => {
    setExpandedClienti((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(clienteId)) {
        newSet.delete(clienteId);
      } else {
        newSet.add(clienteId);
      }
      return newSet;
    });
  };

  const handleOpenModal = (scadenza?: Scadenza) => {
    if (scadenza) {
      setEditingScadenza(scadenza);
      setFormData({
        idVeicolo: scadenza.idVeicolo,
        meseScadenza: scadenza.meseScadenza,
        annoScadenza: scadenza.annoScadenza,
        periodicita: scadenza.periodicita,
        importoPrevisto: scadenza.importoPrevisto?.toString() || '',
        stato: scadenza.stato,
      });
    } else {
      setEditingScadenza(null);
      setFormData({
        idVeicolo: veicoli.length > 0 ? veicoli[0].id : 0,
        meseScadenza: meseSelezionato,
        annoScadenza: annoSelezionato,
        periodicita: Periodicita.ANNUALE,
        importoPrevisto: '',
        stato: StatoScadenza.DA_PAGARE,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingScadenza(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        idVeicolo: formData.idVeicolo,
        meseScadenza: formData.meseScadenza,
        annoScadenza: formData.annoScadenza,
        periodicita: formData.periodicita,
        importoPrevisto: formData.importoPrevisto ? parseFloat(formData.importoPrevisto) : undefined,
        stato: formData.stato,
      };
      if (editingScadenza) {
        await scadenzeService.update(editingScadenza.id, data);
      } else {
        await scadenzeService.create(data);
      }
      handleCloseModal();
      loadScadenze();
    } catch (error) {
      console.error('Errore nel salvataggio della scadenza:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Sei sicuro di voler eliminare questa scadenza?')) {
      try {
        await scadenzeService.delete(id);
        loadScadenze();
      } catch (error) {
        console.error('Errore nell\'eliminazione della scadenza:', error);
      }
    }
  };

  const handleRicalcolaBollo = async (id: number) => {
    try {
      await scadenzeService.ricalcolaImporto(id);
      loadScadenze();
    } catch (error) {
      console.error('Errore nel ricalcolo del bollo:', error);
      alert('Errore nel ricalcolo del bollo. Verifica che il veicolo abbia tutti i parametri necessari.');
    }
  };

  const handleGeneraScadenze = async () => {
    setGeneraLoading(true);
    setGeneraResult(null);
    try {
      const result = await scadenzeService.generaScadenzeFuture(annoTarget);
      setGeneraResult(result);
      // Ricarica le scadenze dopo la generazione
      loadScadenze();
    } catch (error: any) {
      console.error('Errore nella generazione delle scadenze:', error);
      setGeneraResult({
        veicoliProcessati: 0,
        scadenzeCreate: 0,
        scadenzeSaltate: 0,
        errori: [error.message || 'Errore sconosciuto'],
      });
    } finally {
      setGeneraLoading(false);
    }
  };

  const getStatoColor = (stato: string) => {
    switch (stato) {
      case 'DA_PAGARE':
        return 'bg-yellow-100 text-yellow-800';
      case 'PAGATO':
        return 'bg-green-100 text-green-800';
      case 'SCADUTO':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Conta totale veicoli in scadenza
  const totaleVeicoli = clientiConScadenze.reduce((acc, c) => acc + c.veicoliCount, 0);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
          <CalendarIcon className="mr-3" size={32} />
          Scadenziario
        </h1>
        <div className="flex space-x-2">
          <Button variant="secondary" onClick={() => setShowGeneraModal(true)}>
            <Wand2 size={20} className="mr-2" />
            Genera Scadenze
          </Button>
          <Button onClick={() => handleOpenModal()}>
            <Plus size={20} className="mr-2" />
            Nuova Scadenza
          </Button>
        </div>
      </div>

      {/* Filtro Mese/Anno */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Mese:</label>
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={meseSelezionato}
              onChange={(e) => setMeseSelezionato(Number(e.target.value))}
            >
              {MESI.map((mese) => (
                <option key={mese.value} value={mese.value}>
                  {mese.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Anno:</label>
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={annoSelezionato}
              onChange={(e) => setAnnoSelezionato(Number(e.target.value))}
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((anno) => (
                <option key={anno} value={anno}>
                  {anno}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1"></div>
          <div className="text-sm text-gray-600">
            <span className="font-semibold text-lg text-blue-600">{totaleVeicoli}</span> veicoli in scadenza
          </div>
        </div>
      </div>

      {/* Lista raggruppata per cliente */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {clientiConScadenze.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            Nessuna scadenza per {getMeseLabel(meseSelezionato)} {annoSelezionato}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {clientiConScadenze.map(({ cliente, scadenze: scadenzeCliente, veicoliCount }) => {
              const isExpanded = expandedClienti.has(cliente.id);
              return (
                <div key={cliente.id}>
                  {/* Riga cliente */}
                  <div
                    className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleExpanded(cliente.id)}
                  >
                    <div className="flex items-center space-x-3">
                      {isExpanded ? (
                        <ChevronDown size={20} className="text-gray-400" />
                      ) : (
                        <ChevronRight size={20} className="text-gray-400" />
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{getClienteDisplayName(cliente)}</p>
                        <p className="text-sm text-gray-500">
                          {cliente.email || cliente.telefono || '-'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                        <Car size={16} className="mr-1" />
                        {veicoliCount} veicol{veicoliCount === 1 ? 'o' : 'i'}
                      </span>
                    </div>
                  </div>

                  {/* Dettaglio veicoli espanso */}
                  {isExpanded && (
                    <div className="bg-gray-50 px-6 py-4">
                      <table className="min-w-full">
                        <thead>
                          <tr className="text-xs text-gray-500 uppercase">
                            <th className="text-left py-2">Targa</th>
                            <th className="text-left py-2">Tipo</th>
                            <th className="text-left py-2">Data Immatric.</th>
                            <th className="text-left py-2">Periodicita</th>
                            <th className="text-left py-2">Importo</th>
                            <th className="text-left py-2">Stato</th>
                            <th className="text-right py-2">Azioni</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {scadenzeCliente.map((scadenza) => (
                            <tr key={scadenza.id} className="text-sm">
                              <td className="py-3 font-medium text-gray-900">
                                {scadenza.veicolo?.targa || '-'}
                              </td>
                              <td className="py-3 text-gray-500">
                                {scadenza.veicolo?.tipoVeicolo || '-'}
                              </td>
                              <td className="py-3 text-gray-500">
                                {scadenza.veicolo?.dataImmatricolazione
                                  ? new Date(scadenza.veicolo.dataImmatricolazione).toLocaleDateString('it-IT')
                                  : '-'}
                              </td>
                              <td className="py-3">
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                                  {scadenza.periodicita === 'QUADRIMESTRALE' ? '4 mesi' : 'Annuale'}
                                </span>
                              </td>
                              <td className="py-3 text-gray-500">
                                {scadenza.importoPrevisto ? `€ ${scadenza.importoPrevisto}` : '-'}
                              </td>
                              <td className="py-3">
                                <span
                                  className={`px-2 py-1 text-xs font-medium rounded-full ${getStatoColor(
                                    scadenza.stato
                                  )}`}
                                >
                                  {scadenza.stato.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRicalcolaBollo(scadenza.id);
                                  }}
                                  className="text-green-600 hover:text-green-900 mr-3"
                                  title="Ricalcola importo bollo"
                                >
                                  <Calculator size={16} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenModal(scadenza);
                                  }}
                                  className="text-blue-600 hover:text-blue-900 mr-3"
                                  title="Modifica scadenza"
                                >
                                  <Edit size={16} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(scadenza.id);
                                  }}
                                  className="text-red-600 hover:text-red-900"
                                  title="Elimina scadenza"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingScadenza ? 'Modifica Scadenza' : 'Nuova Scadenza'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Veicolo *
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.idVeicolo}
                  onChange={(e) => setFormData({ ...formData, idVeicolo: Number(e.target.value) })}
                  required
                >
                  <option value="">Seleziona un veicolo</option>
                  {veicoli.map((veicolo) => (
                    <option key={veicolo.id} value={veicolo.id}>
                      {veicolo.targa} - {veicolo.cliente ? getClienteDisplayName(veicolo.cliente) : 'N/A'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mese Scadenza *
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.meseScadenza}
                    onChange={(e) => setFormData({ ...formData, meseScadenza: Number(e.target.value) })}
                    required
                  >
                    {MESI.map((mese) => (
                      <option key={mese.value} value={mese.value}>
                        {mese.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Anno *
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.annoScadenza}
                    onChange={(e) => setFormData({ ...formData, annoScadenza: Number(e.target.value) })}
                    required
                  >
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map((anno) => (
                      <option key={anno} value={anno}>
                        {anno}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Periodicita *
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.periodicita}
                  onChange={(e) => setFormData({ ...formData, periodicita: e.target.value as Periodicita })}
                  required
                >
                  <option value="ANNUALE">Annuale (12 mesi)</option>
                  <option value="QUADRIMESTRALE">Quadrimestrale (4 mesi)</option>
                </select>
              </div>
              <div>
                <Input
                  label="Importo Previsto"
                  type="number"
                  step="0.01"
                  value={formData.importoPrevisto}
                  onChange={(e) => setFormData({ ...formData, importoPrevisto: e.target.value })}
                  placeholder="es. 150.00"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Lascia vuoto per calcolare automaticamente in base alle tariffe configurate
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stato *</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.stato}
                  onChange={(e) => setFormData({ ...formData, stato: e.target.value as StatoScadenza })}
                  required
                >
                  <option value="DA_PAGARE">Da Pagare</option>
                  <option value="PAGATO">Pagato</option>
                  <option value="SCADUTO">Scaduto</option>
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="secondary" onClick={handleCloseModal}>
                  Annulla
                </Button>
                <Button type="submit">
                  {editingScadenza ? 'Salva' : 'Crea'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Genera Scadenze Future */}
      {showGeneraModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <Wand2 size={24} className="mr-2 text-blue-600" />
                Genera Scadenze Future
              </h2>
              <button
                onClick={() => {
                  setShowGeneraModal(false);
                  setGeneraResult(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {!generaResult ? (
                <>
                  <p className="text-gray-600">
                    Questa funzione genera automaticamente le scadenze per tutti i veicoli
                    fino all'anno selezionato. Le scadenze gia esistenti non verranno duplicate.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Genera scadenze fino all'anno:
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={annoTarget}
                      onChange={(e) => setAnnoTarget(Number(e.target.value))}
                      disabled={generaLoading}
                    >
                      {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map((anno) => (
                        <option key={anno} value={anno}>
                          {anno}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-800 mb-2">Come funziona:</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>- Il mese di scadenza e calcolato dalla data di immatricolazione</li>
                      <li>- Annuale: scadenza nel mese di immatricolazione</li>
                      <li>- Quadrimestrale: 3 scadenze/anno (Gen, Mag, Set) in base al periodo di immatricolazione</li>
                      <li>- Calcola automaticamente l'importo in base alle tariffe</li>
                      <li>- Veicoli senza data immatricolazione: usa scadenze esistenti come riferimento</li>
                    </ul>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg ${generaResult.scadenzeCreate > 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                    <h4 className={`font-semibold mb-3 ${generaResult.scadenzeCreate > 0 ? 'text-green-800' : 'text-gray-800'}`}>
                      Risultato Generazione
                    </h4>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-gray-900">{generaResult.veicoliProcessati}</p>
                        <p className="text-sm text-gray-600">Veicoli processati</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-green-600">{generaResult.scadenzeCreate}</p>
                        <p className="text-sm text-gray-600">Scadenze create</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-gray-500">{generaResult.scadenzeSaltate}</p>
                        <p className="text-sm text-gray-600">Gia esistenti</p>
                      </div>
                    </div>
                  </div>
                  {generaResult.errori.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <h4 className="font-medium text-red-800 mb-2">Errori ({generaResult.errori.length}):</h4>
                      <ul className="text-sm text-red-700 space-y-1 max-h-32 overflow-y-auto">
                        {generaResult.errori.map((err, i) => (
                          <li key={i}>- {err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-2">
              {!generaResult ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setShowGeneraModal(false)}
                    disabled={generaLoading}
                  >
                    Annulla
                  </Button>
                  <Button onClick={handleGeneraScadenze} disabled={generaLoading}>
                    {generaLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Generazione in corso...
                      </>
                    ) : (
                      <>
                        <Wand2 size={18} className="mr-2" />
                        Genera Scadenze
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => {
                    setShowGeneraModal(false);
                    setGeneraResult(null);
                  }}
                >
                  Chiudi
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
