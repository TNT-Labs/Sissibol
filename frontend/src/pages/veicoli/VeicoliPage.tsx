import React, { useEffect, useState } from 'react';
import { veicoliService } from '../../services/veicoli.service';
import { clientiService } from '../../services/clienti.service';
import { getClienteDisplayName } from '../../types';
import type { Veicolo, Cliente } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import {
  TIPI_VEICOLO,
  CLASSI_AMBIENTALI,
  REGIONI_ITALIANE,
  TIPI_ALIMENTAZIONE,
  TIPI_SOSPENSIONE,
  shouldShowField
} from '../../constants/domini';
import { Plus, Search, Edit, Trash2, X, Car } from 'lucide-react';

interface VeicoloFormData {
  idCliente: number;
  targa: string;
  tipoVeicolo: string;
  classeAmbientale: string;
  regione: string;
  alimentazione: string;
  potenzaKw: string;
  cilindrata: string;
  portataKg: string;
  pesoComplessivoKg: string;
  numeroAssi: string;
  tipoSospensione: string;
  numeroPosti: string;
  massaRimorchiabileKg: string;
  dataImmatricolazione: string;
  note: string;
}

const emptyFormData: VeicoloFormData = {
  idCliente: 0,
  targa: '',
  tipoVeicolo: '',
  classeAmbientale: '',
  regione: '',
  alimentazione: '',
  potenzaKw: '',
  cilindrata: '',
  portataKg: '',
  pesoComplessivoKg: '',
  numeroAssi: '',
  tipoSospensione: '',
  numeroPosti: '',
  massaRimorchiabileKg: '',
  dataImmatricolazione: '',
  note: '',
};

export const VeicoliPage: React.FC = () => {
  const [veicoli, setVeicoli] = useState<Veicolo[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCliente, setFilterCliente] = useState<number | undefined>();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingVeicolo, setEditingVeicolo] = useState<Veicolo | null>(null);
  const [formData, setFormData] = useState<VeicoloFormData>(emptyFormData);

  useEffect(() => {
    loadClienti();
    loadVeicoli();
  }, []);

  const loadClienti = async () => {
    try {
      const data = await clientiService.getAll();
      setClienti(data);
    } catch (error) {
      console.error('Errore nel caricamento dei clienti:', error);
    }
  };

  const loadVeicoli = async () => {
    try {
      const data = await veicoliService.getAll(filterCliente, search || undefined);
      setVeicoli(data);
    } catch (error) {
      console.error('Errore nel caricamento dei veicoli:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadVeicoli();
  };

  const handleOpenModal = (veicolo?: Veicolo) => {
    if (veicolo) {
      setEditingVeicolo(veicolo);
      setFormData({
        idCliente: veicolo.idCliente,
        targa: veicolo.targa,
        tipoVeicolo: veicolo.tipoVeicolo || '',
        classeAmbientale: veicolo.classeAmbientale || '',
        regione: veicolo.regione || '',
        alimentazione: veicolo.alimentazione || '',
        potenzaKw: veicolo.potenzaKw?.toString() || '',
        cilindrata: veicolo.cilindrata?.toString() || '',
        portataKg: veicolo.portataKg?.toString() || '',
        pesoComplessivoKg: veicolo.pesoComplessivoKg?.toString() || '',
        numeroAssi: veicolo.numeroAssi?.toString() || '',
        tipoSospensione: veicolo.tipoSospensione || '',
        numeroPosti: veicolo.numeroPosti?.toString() || '',
        massaRimorchiabileKg: veicolo.massaRimorchiabileKg?.toString() || '',
        dataImmatricolazione: veicolo.dataImmatricolazione?.split('T')[0] || '',
        note: veicolo.note || '',
      });
    } else {
      setEditingVeicolo(null);
      setFormData({
        ...emptyFormData,
        idCliente: clienti.length > 0 ? clienti[0].id : 0,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingVeicolo(null);
  };

  // Quando cambia il tipo veicolo, resetta i campi non pertinenti
  const handleTipoVeicoloChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      tipoVeicolo: value,
      // Reset campi condizionali che non sono più visibili
      potenzaKw: shouldShowField(value, 'potenzaKw') ? prev.potenzaKw : '',
      cilindrata: shouldShowField(value, 'cilindrata') ? prev.cilindrata : '',
      portataKg: shouldShowField(value, 'portataKg') ? prev.portataKg : '',
      pesoComplessivoKg: shouldShowField(value, 'pesoComplessivoKg') ? prev.pesoComplessivoKg : '',
      numeroAssi: shouldShowField(value, 'numeroAssi') ? prev.numeroAssi : '',
      tipoSospensione: shouldShowField(value, 'tipoSospensione') ? prev.tipoSospensione : '',
      numeroPosti: shouldShowField(value, 'numeroPosti') ? prev.numeroPosti : '',
      massaRimorchiabileKg: shouldShowField(value, 'massaRimorchiabileKg') ? prev.massaRimorchiabileKg : '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Prepara i dati convertendo i valori numerici
      const submitData: Partial<Veicolo> = {
        idCliente: formData.idCliente,
        targa: formData.targa,
        tipoVeicolo: formData.tipoVeicolo || undefined,
        classeAmbientale: formData.classeAmbientale || undefined,
        regione: formData.regione || undefined,
        alimentazione: formData.alimentazione || undefined,
        potenzaKw: formData.potenzaKw ? parseFloat(formData.potenzaKw) : undefined,
        cilindrata: formData.cilindrata ? parseInt(formData.cilindrata) : undefined,
        portataKg: formData.portataKg ? parseInt(formData.portataKg) : undefined,
        pesoComplessivoKg: formData.pesoComplessivoKg ? parseInt(formData.pesoComplessivoKg) : undefined,
        numeroAssi: formData.numeroAssi ? parseInt(formData.numeroAssi) : undefined,
        tipoSospensione: formData.tipoSospensione || undefined,
        numeroPosti: formData.numeroPosti ? parseInt(formData.numeroPosti) : undefined,
        massaRimorchiabileKg: formData.massaRimorchiabileKg ? parseInt(formData.massaRimorchiabileKg) : undefined,
        dataImmatricolazione: formData.dataImmatricolazione || undefined,
        note: formData.note || undefined,
      };

      if (editingVeicolo) {
        await veicoliService.update(editingVeicolo.id, submitData);
      } else {
        await veicoliService.create(submitData);
      }
      handleCloseModal();
      loadVeicoli();
    } catch (error) {
      console.error('Errore nel salvataggio del veicolo:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Sei sicuro di voler eliminare questo veicolo?')) {
      try {
        await veicoliService.delete(id);
        loadVeicoli();
      } catch (error) {
        console.error('Errore nell\'eliminazione del veicolo:', error);
      }
    }
  };

  // Verifica se mostrare la sezione parametri tecnici
  const showParametriTecnici = formData.tipoVeicolo && (
    shouldShowField(formData.tipoVeicolo, 'potenzaKw') ||
    shouldShowField(formData.tipoVeicolo, 'cilindrata') ||
    shouldShowField(formData.tipoVeicolo, 'portataKg') ||
    shouldShowField(formData.tipoVeicolo, 'pesoComplessivoKg') ||
    shouldShowField(formData.tipoVeicolo, 'numeroAssi') ||
    shouldShowField(formData.tipoVeicolo, 'tipoSospensione') ||
    shouldShowField(formData.tipoVeicolo, 'numeroPosti') ||
    shouldShowField(formData.tipoVeicolo, 'massaRimorchiabileKg')
  );

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
          <Car className="mr-3" size={32} />
          Veicoli
        </h1>
        <Button onClick={() => handleOpenModal()}>
          <Plus size={20} className="mr-2" />
          Nuovo Veicolo
        </Button>
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex space-x-2">
          <div className="flex-1">
            <Input
              placeholder="Cerca per targa o nome cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div className="w-64">
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterCliente || ''}
              onChange={(e) => setFilterCliente(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">Tutti i clienti</option>
              {clienti.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {getClienteDisplayName(cliente)}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleSearch}>
            <Search size={20} className="mr-2" />
            Cerca
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Targa
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cliente
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tipo Veicolo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Classe Ambientale
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Potenza/Cilindrata
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Azioni
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {veicoli.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  Nessun veicolo trovato
                </td>
              </tr>
            ) : (
              veicoli.map((veicolo) => (
                <tr key={veicolo.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {veicolo.targa}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {veicolo.cliente ? getClienteDisplayName(veicolo.cliente) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {veicolo.tipoVeicolo || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {veicolo.classeAmbientale || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {veicolo.potenzaKw ? `${veicolo.potenzaKw} KW` : ''}
                    {veicolo.potenzaKw && veicolo.cilindrata ? ' / ' : ''}
                    {veicolo.cilindrata ? `${veicolo.cilindrata} cc` : ''}
                    {!veicolo.potenzaKw && !veicolo.cilindrata ? '-' : ''}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleOpenModal(veicolo)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(veicolo.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingVeicolo ? 'Modifica Veicolo' : 'Nuovo Veicolo'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-6">
              {/* Sezione Dati Principali */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b">
                  Dati Principali
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cliente *
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.idCliente}
                      onChange={(e) => setFormData({ ...formData, idCliente: Number(e.target.value) })}
                      required
                    >
                      <option value="">Seleziona un cliente</option>
                      {clienti.map((cliente) => (
                        <option key={cliente.id} value={cliente.id}>
                          {getClienteDisplayName(cliente)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Targa *"
                    value={formData.targa}
                    onChange={(e) => setFormData({ ...formData, targa: e.target.value.toUpperCase() })}
                    required
                    placeholder="AA123BB"
                  />
                </div>
              </div>

              {/* Sezione Classificazione Veicolo */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b">
                  Classificazione Veicolo
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SearchableSelect
                    label="Tipo Veicolo"
                    options={TIPI_VEICOLO}
                    value={formData.tipoVeicolo}
                    onChange={handleTipoVeicoloChange}
                    placeholder="Seleziona o cerca..."
                    allowCustom
                  />
                  <SearchableSelect
                    label="Classe Ambientale"
                    options={CLASSI_AMBIENTALI}
                    value={formData.classeAmbientale}
                    onChange={(value) => setFormData({ ...formData, classeAmbientale: value })}
                    placeholder="Seleziona o cerca..."
                    allowCustom
                  />
                  <SearchableSelect
                    label="Alimentazione"
                    options={TIPI_ALIMENTAZIONE}
                    value={formData.alimentazione}
                    onChange={(value) => setFormData({ ...formData, alimentazione: value })}
                    placeholder="Seleziona o cerca..."
                    allowCustom
                  />
                  <SearchableSelect
                    label="Regione"
                    options={REGIONI_ITALIANE}
                    value={formData.regione}
                    onChange={(value) => setFormData({ ...formData, regione: value })}
                    placeholder="Seleziona o cerca..."
                  />
                  <Input
                    label="Data Immatricolazione"
                    type="date"
                    value={formData.dataImmatricolazione}
                    onChange={(e) => setFormData({ ...formData, dataImmatricolazione: e.target.value })}
                  />
                </div>
              </div>

              {/* Sezione Parametri Tecnici (condizionale) */}
              {showParametriTecnici && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4 pb-2 border-b">
                    Parametri Tecnici per Calcolo Bollo
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {shouldShowField(formData.tipoVeicolo, 'potenzaKw') && (
                      <Input
                        label="Potenza (KW)"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.potenzaKw}
                        onChange={(e) => setFormData({ ...formData, potenzaKw: e.target.value })}
                        placeholder="es. 85.5"
                      />
                    )}
                    {shouldShowField(formData.tipoVeicolo, 'cilindrata') && (
                      <Input
                        label="Cilindrata (cc)"
                        type="number"
                        min="0"
                        value={formData.cilindrata}
                        onChange={(e) => setFormData({ ...formData, cilindrata: e.target.value })}
                        placeholder="es. 1600"
                      />
                    )}
                    {shouldShowField(formData.tipoVeicolo, 'portataKg') && (
                      <Input
                        label="Portata (KG)"
                        type="number"
                        min="0"
                        value={formData.portataKg}
                        onChange={(e) => setFormData({ ...formData, portataKg: e.target.value })}
                        placeholder="es. 3500"
                      />
                    )}
                    {shouldShowField(formData.tipoVeicolo, 'pesoComplessivoKg') && (
                      <Input
                        label="Peso Complessivo (KG)"
                        type="number"
                        min="0"
                        value={formData.pesoComplessivoKg}
                        onChange={(e) => setFormData({ ...formData, pesoComplessivoKg: e.target.value })}
                        placeholder="es. 12000"
                      />
                    )}
                    {shouldShowField(formData.tipoVeicolo, 'numeroAssi') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Numero Assi
                        </label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={formData.numeroAssi}
                          onChange={(e) => setFormData({ ...formData, numeroAssi: e.target.value })}
                        >
                          <option value="">Seleziona...</option>
                          <option value="2">2 assi</option>
                          <option value="3">3 assi</option>
                          <option value="4">4 o più assi</option>
                        </select>
                      </div>
                    )}
                    {shouldShowField(formData.tipoVeicolo, 'tipoSospensione') && (
                      <SearchableSelect
                        label="Tipo Sospensione"
                        options={TIPI_SOSPENSIONE}
                        value={formData.tipoSospensione}
                        onChange={(value) => setFormData({ ...formData, tipoSospensione: value })}
                        placeholder="Seleziona..."
                      />
                    )}
                    {shouldShowField(formData.tipoVeicolo, 'numeroPosti') && (
                      <Input
                        label="Numero Posti"
                        type="number"
                        min="1"
                        value={formData.numeroPosti}
                        onChange={(e) => setFormData({ ...formData, numeroPosti: e.target.value })}
                        placeholder="es. 40"
                      />
                    )}
                    {shouldShowField(formData.tipoVeicolo, 'massaRimorchiabileKg') && (
                      <Input
                        label="Massa Rimorchiabile (KG)"
                        type="number"
                        min="0"
                        value={formData.massaRimorchiabileKg}
                        onChange={(e) => setFormData({ ...formData, massaRimorchiabileKg: e.target.value })}
                        placeholder="es. 40000"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Note
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={handleCloseModal}>
                  Annulla
                </Button>
                <Button type="submit">
                  {editingVeicolo ? 'Salva' : 'Crea'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
