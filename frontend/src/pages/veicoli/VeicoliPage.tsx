import React, { useEffect, useState } from 'react';
import { veicoliService } from '../../services/veicoli.service';
import { clientiService } from '../../services/clienti.service';
import { getClienteDisplayName } from '../../types';
import type { Veicolo, Cliente } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { TIPI_VEICOLO, CLASSI_AMBIENTALI, REGIONI_ITALIANE } from '../../constants/domini';
import { Plus, Search, Edit, Trash2, X, Car } from 'lucide-react';

export const VeicoliPage: React.FC = () => {
  const [veicoli, setVeicoli] = useState<Veicolo[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCliente, setFilterCliente] = useState<number | undefined>();
  const [showModal, setShowModal] = useState(false);
  const [editingVeicolo, setEditingVeicolo] = useState<Veicolo | null>(null);
  const [formData, setFormData] = useState({
    idCliente: 0,
    targa: '',
    tipoVeicolo: '',
    classeAmbientale: '',
    regione: '',
    note: '',
  });

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
      const data = await veicoliService.getAll(filterCliente);
      setVeicoli(data);
    } catch (error) {
      console.error('Errore nel caricamento dei veicoli:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
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
        note: veicolo.note || '',
      });
    } else {
      setEditingVeicolo(null);
      setFormData({
        idCliente: clienti.length > 0 ? clienti[0].id : 0,
        targa: '',
        tipoVeicolo: '',
        classeAmbientale: '',
        regione: '',
        note: '',
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingVeicolo(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingVeicolo) {
        await veicoliService.update(editingVeicolo.id, formData);
      } else {
        await veicoliService.create(formData);
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

      {/* Filter Bar */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex space-x-2">
          <div className="flex-1">
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
          <Button onClick={handleFilter}>
            <Search size={20} className="mr-2" />
            Filtra
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
                Regione
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
                    {veicolo.regione || '-'}
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
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingVeicolo ? 'Modifica Veicolo' : 'Nuovo Veicolo'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
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
              <SearchableSelect
                label="Tipo Veicolo"
                options={TIPI_VEICOLO}
                value={formData.tipoVeicolo}
                onChange={(value) => setFormData({ ...formData, tipoVeicolo: value })}
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
                label="Regione"
                options={REGIONI_ITALIANE}
                value={formData.regione}
                onChange={(value) => setFormData({ ...formData, regione: value })}
                placeholder="Seleziona o cerca..."
              />
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
              <div className="flex justify-end space-x-2 pt-4">
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
