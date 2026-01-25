import React, { useEffect, useState, useMemo } from 'react';
import { scadenzeService } from '../../services/scadenze.service';
import { veicoliService } from '../../services/veicoli.service';
import { StatoScadenza, Periodicita, getClienteDisplayName } from '../../types';
import type { Scadenza, Cliente, Veicolo } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Plus, X, Calendar as CalendarIcon, ChevronDown, ChevronRight, Car, Edit, Trash2 } from 'lucide-react';
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [scadenzeData, veicoliData] = await Promise.all([
        scadenzeService.getAll(),
        veicoliService.getAll(),
      ]);
      setScadenze(scadenzeData);
      setVeicoli(veicoliData);
    } catch (error) {
      console.error('Errore nel caricamento dei dati:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filtra scadenze per mese/anno selezionato e raggruppa per cliente
  const clientiConScadenze = useMemo((): ClienteConScadenze[] => {
    // Filtra scadenze per il mese/anno selezionato
    const scadenzeFiltrate = scadenze.filter(
      (s) => s.meseScadenza === meseSelezionato && s.annoScadenza === annoSelezionato
    );

    // Raggruppa per cliente
    const clienteMap = new Map<number, ClienteConScadenze>();

    scadenzeFiltrate.forEach((scadenza) => {
      const clienteId = scadenza.veicolo?.cliente?.id;
      if (!clienteId) return;

      if (!clienteMap.has(clienteId)) {
        clienteMap.set(clienteId, {
          cliente: scadenza.veicolo!.cliente!,
          scadenze: [],
          veicoliCount: 0,
        });
      }

      const entry = clienteMap.get(clienteId)!;
      entry.scadenze.push(scadenza);
      entry.veicoliCount = entry.scadenze.length;
    });

    // Ordina per nome cliente
    return Array.from(clienteMap.values()).sort((a, b) =>
      getClienteDisplayName(a.cliente).localeCompare(getClienteDisplayName(b.cliente))
    );
  }, [scadenze, meseSelezionato, annoSelezionato]);

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
      loadData();
    } catch (error) {
      console.error('Errore nel salvataggio della scadenza:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Sei sicuro di voler eliminare questa scadenza?')) {
      try {
        await scadenzeService.delete(id);
        loadData();
      } catch (error) {
        console.error('Errore nell\'eliminazione della scadenza:', error);
      }
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
        <Button onClick={() => handleOpenModal()}>
          <Plus size={20} className="mr-2" />
          Nuova Scadenza
        </Button>
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
                                    handleOpenModal(scadenza);
                                  }}
                                  className="text-blue-600 hover:text-blue-900 mr-3"
                                >
                                  <Edit size={16} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(scadenza.id);
                                  }}
                                  className="text-red-600 hover:text-red-900"
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
              <Input
                label="Importo Previsto"
                type="number"
                step="0.01"
                value={formData.importoPrevisto}
                onChange={(e) => setFormData({ ...formData, importoPrevisto: e.target.value })}
                placeholder="es. 150.00"
              />
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
    </div>
  );
};
