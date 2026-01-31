import React, { useEffect, useState } from 'react';
import { bolloService } from '../../services/bollo.service';
import type { ConfigurazioneBollo, TariffaBollo } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Settings, Plus, Copy, ChevronDown, ChevronRight, Edit2, Check, X } from 'lucide-react';

export const TariffePage: React.FC = () => {
  const [configurazioni, setConfigurazioni] = useState<ConfigurazioneBollo[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<ConfigurazioneBollo | null>(null);
  const [tariffe, setTariffe] = useState<TariffaBollo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTipi, setExpandedTipi] = useState<Set<string>>(new Set());
  const [editingTariffa, setEditingTariffa] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ importoUnitario: string; importoFisso: string }>({
    importoUnitario: '',
    importoFisso: '',
  });

  // Modal per nuova configurazione
  const [showNewConfigModal, setShowNewConfigModal] = useState(false);
  const [newConfigData, setNewConfigData] = useState({
    annoValidita: new Date().getFullYear() + 1,
    regione: 'Lombardia',
    scontoRid: 15,
  });

  // Modal per duplica configurazione
  const [showDuplicaModal, setShowDuplicaModal] = useState(false);
  const [duplicaAnno, setDuplicaAnno] = useState(new Date().getFullYear() + 1);

  useEffect(() => {
    loadConfigurazioni();
  }, []);

  const loadConfigurazioni = async () => {
    try {
      const data = await bolloService.getConfigurazioni();
      setConfigurazioni(data);
      if (data.length > 0 && !selectedConfig) {
        handleSelectConfig(data[0]);
      }
    } catch (error) {
      console.error('Errore nel caricamento delle configurazioni:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectConfig = async (config: ConfigurazioneBollo) => {
    setSelectedConfig(config);
    try {
      const tariffeData = await bolloService.getTariffe(config.id);
      setTariffe(tariffeData);
      // Espandi tutti i tipi veicolo di default
      const tipi = new Set(tariffeData.map((t) => t.tipoVeicolo));
      setExpandedTipi(tipi);
    } catch (error) {
      console.error('Errore nel caricamento delle tariffe:', error);
    }
  };

  const toggleTipoExpanded = (tipo: string) => {
    const newExpanded = new Set(expandedTipi);
    if (newExpanded.has(tipo)) {
      newExpanded.delete(tipo);
    } else {
      newExpanded.add(tipo);
    }
    setExpandedTipi(newExpanded);
  };

  const handleCreateConfig = async () => {
    try {
      const newConfig = await bolloService.createConfigurazione(newConfigData);
      setConfigurazioni([newConfig, ...configurazioni]);
      setShowNewConfigModal(false);
      handleSelectConfig(newConfig);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Errore nella creazione della configurazione');
    }
  };

  const handleDuplicaConfig = async () => {
    if (!selectedConfig) return;
    try {
      const newConfig = await bolloService.duplicaConfigurazione(selectedConfig.id, duplicaAnno);
      await loadConfigurazioni();
      handleSelectConfig(newConfig);
      setShowDuplicaModal(false);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Errore nella duplicazione della configurazione');
    }
  };

  const startEditTariffa = (tariffa: TariffaBollo) => {
    setEditingTariffa(tariffa.id);
    setEditValues({
      importoUnitario: tariffa.importoUnitario.toString(),
      importoFisso: tariffa.importoFisso?.toString() || '',
    });
  };

  const cancelEditTariffa = () => {
    setEditingTariffa(null);
    setEditValues({ importoUnitario: '', importoFisso: '' });
  };

  const saveEditTariffa = async (id: number) => {
    try {
      await bolloService.updateTariffa(id, {
        importoUnitario: parseFloat(editValues.importoUnitario),
        importoFisso: editValues.importoFisso ? parseFloat(editValues.importoFisso) : undefined,
      });
      // Ricarica le tariffe
      if (selectedConfig) {
        const tariffeData = await bolloService.getTariffe(selectedConfig.id);
        setTariffe(tariffeData);
      }
      setEditingTariffa(null);
    } catch (error) {
      console.error('Errore nel salvataggio della tariffa:', error);
    }
  };

  // Raggruppa tariffe per tipo veicolo
  const tariffeRaggruppate = tariffe.reduce(
    (acc, tariffa) => {
      if (!acc[tariffa.tipoVeicolo]) {
        acc[tariffa.tipoVeicolo] = [];
      }
      acc[tariffa.tipoVeicolo].push(tariffa);
      return acc;
    },
    {} as Record<string, TariffaBollo[]>
  );

  const formatImporto = (value: number | string | undefined | null, decimali: number = 2) => {
    if (value === undefined || value === null) return '-';
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return '-';
    return `€ ${numValue.toFixed(decimali)}`;
  };

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
          <Settings className="mr-3" size={32} />
          Configurazione Tariffe Bollo
        </h1>
        <div className="flex space-x-2">
          {selectedConfig && (
            <Button variant="secondary" onClick={() => setShowDuplicaModal(true)}>
              <Copy size={20} className="mr-2" />
              Duplica per nuovo anno
            </Button>
          )}
          <Button onClick={() => setShowNewConfigModal(true)}>
            <Plus size={20} className="mr-2" />
            Nuova Configurazione
          </Button>
        </div>
      </div>

      {/* Selector configurazione */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center space-x-4">
          <label className="font-medium text-gray-700">Configurazione:</label>
          <select
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedConfig?.id || ''}
            onChange={(e) => {
              const config = configurazioni.find((c) => c.id === Number(e.target.value));
              if (config) handleSelectConfig(config);
            }}
          >
            {configurazioni.map((config) => (
              <option key={config.id} value={config.id}>
                {config.regione} - Anno {config.annoValidita}
                {config.attivo ? ' (Attiva)' : ''}
              </option>
            ))}
          </select>
        </div>
        {selectedConfig && (
          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Sconto RID:</span>
              <span className="ml-2 font-medium">{selectedConfig.scontoRid}%</span>
            </div>
            <div>
              <span className="text-gray-500">Tariffe configurate:</span>
              <span className="ml-2 font-medium">{tariffe.length}</span>
            </div>
            <div>
              <span className="text-gray-500">Note:</span>
              <span className="ml-2">{selectedConfig.note || '-'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Tabella tariffe raggruppate */}
      {selectedConfig && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Tariffe per tipo veicolo</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {Object.entries(tariffeRaggruppate).map(([tipoVeicolo, tariffeTipo]) => (
              <div key={tipoVeicolo}>
                <button
                  className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  onClick={() => toggleTipoExpanded(tipoVeicolo)}
                >
                  <div className="flex items-center">
                    {expandedTipi.has(tipoVeicolo) ? (
                      <ChevronDown size={20} className="mr-2 text-gray-400" />
                    ) : (
                      <ChevronRight size={20} className="mr-2 text-gray-400" />
                    )}
                    <span className="font-medium">{tipoVeicolo}</span>
                    <span className="ml-2 text-sm text-gray-500">({tariffeTipo.length} tariffe)</span>
                  </div>
                </button>
                {expandedTipi.has(tipoVeicolo) && (
                  <div className="bg-gray-50 px-6 py-2">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="py-2 pr-4">Categoria Euro</th>
                          <th className="py-2 pr-4">Unità</th>
                          <th className="py-2 pr-4">Soglia</th>
                          <th className="py-2 pr-4">Importo Unitario</th>
                          <th className="py-2 pr-4">Importo Fisso</th>
                          <th className="py-2 pr-4">Periodicità</th>
                          <th className="py-2">Azioni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tariffeTipo.map((tariffa) => (
                          <tr key={tariffa.id} className="border-t border-gray-200">
                            <td className="py-2 pr-4">{tariffa.categoriaEuro || '-'}</td>
                            <td className="py-2 pr-4">{tariffa.unitaMisura}</td>
                            <td className="py-2 pr-4">
                              {tariffa.sogliaMin !== null && tariffa.sogliaMin !== undefined
                                ? `${tariffa.sogliaMin}${tariffa.sogliaMax ? ` - ${tariffa.sogliaMax}` : '+'}`
                                : '-'}
                              {tariffa.tipoSospensione && ` (${tariffa.tipoSospensione})`}
                            </td>
                            <td className="py-2 pr-4">
                              {editingTariffa === tariffa.id ? (
                                <Input
                                  type="number"
                                  step="0.0001"
                                  value={editValues.importoUnitario}
                                  onChange={(e) =>
                                    setEditValues({ ...editValues, importoUnitario: e.target.value })
                                  }
                                  className="w-24 text-sm"
                                />
                              ) : (
                                formatImporto(tariffa.importoUnitario, 4)
                              )}
                            </td>
                            <td className="py-2 pr-4">
                              {editingTariffa === tariffa.id ? (
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={editValues.importoFisso}
                                  onChange={(e) =>
                                    setEditValues({ ...editValues, importoFisso: e.target.value })
                                  }
                                  className="w-24 text-sm"
                                />
                              ) : (
                                formatImporto(tariffa.importoFisso)
                              )}
                            </td>
                            <td className="py-2 pr-4">{tariffa.periodicita}</td>
                            <td className="py-2">
                              {editingTariffa === tariffa.id ? (
                                <div className="flex space-x-1">
                                  <button
                                    onClick={() => saveEditTariffa(tariffa.id)}
                                    className="text-green-600 hover:text-green-800"
                                  >
                                    <Check size={16} />
                                  </button>
                                  <button
                                    onClick={cancelEditTariffa}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => startEditTariffa(tariffa)}
                                  className="text-blue-600 hover:text-blue-800"
                                >
                                  <Edit2 size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal nuova configurazione */}
      {showNewConfigModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Nuova Configurazione Tariffe</h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              <Input
                label="Anno Validità"
                type="number"
                value={newConfigData.annoValidita}
                onChange={(e) =>
                  setNewConfigData({ ...newConfigData, annoValidita: parseInt(e.target.value) })
                }
              />
              <Input
                label="Regione"
                value={newConfigData.regione}
                onChange={(e) => setNewConfigData({ ...newConfigData, regione: e.target.value })}
              />
              <Input
                label="Sconto RID (%)"
                type="number"
                step="0.01"
                value={newConfigData.scontoRid}
                onChange={(e) =>
                  setNewConfigData({ ...newConfigData, scontoRid: parseFloat(e.target.value) })
                }
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-2">
              <Button variant="secondary" onClick={() => setShowNewConfigModal(false)}>
                Annulla
              </Button>
              <Button onClick={handleCreateConfig}>Crea</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal duplica configurazione */}
      {showDuplicaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Duplica Configurazione</h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-gray-600">
                Duplica la configurazione <strong>{selectedConfig?.regione}</strong> per un nuovo anno.
                Tutte le tariffe verranno copiate.
              </p>
              <Input
                label="Nuovo Anno"
                type="number"
                value={duplicaAnno}
                onChange={(e) => setDuplicaAnno(parseInt(e.target.value))}
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-2">
              <Button variant="secondary" onClick={() => setShowDuplicaModal(false)}>
                Annulla
              </Button>
              <Button onClick={handleDuplicaConfig}>Duplica</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
