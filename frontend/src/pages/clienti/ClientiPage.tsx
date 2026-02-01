import React, { useEffect, useState } from 'react';
import { clientiService } from '../../services/clienti.service';
import { TipoCliente, getClienteDisplayName } from '../../types';
import type { Cliente } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Plus, Search, Edit, Trash2, X, Building2, User, CheckCircle, XCircle } from 'lucide-react';

type FiltroAttivo = 'tutti' | 'attivi' | 'nonAttivi';

export const ClientiPage: React.FC = () => {
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroAttivo, setFiltroAttivo] = useState<FiltroAttivo>('attivi');
  const [showModal, setShowModal] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState({
    tipoCliente: TipoCliente.PERSONA_GIURIDICA as TipoCliente,
    ragioneSociale: '',
    partitaIva: '',
    nome: '',
    cognome: '',
    codiceFiscale: '',
    indirizzo: '',
    email: '',
    telefono: '',
    note: '',
    attivo: true,
  });

  useEffect(() => {
    loadClienti();
  }, [filtroAttivo]);

  const loadClienti = async () => {
    try {
      const data = await clientiService.getAll(search);
      setClienti(data);
    } catch (error) {
      console.error('Errore nel caricamento dei clienti:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filtra i clienti in base al filtro attivo
  const clientiFiltrati = clienti.filter((cliente) => {
    if (filtroAttivo === 'attivi') return cliente.attivo;
    if (filtroAttivo === 'nonAttivi') return !cliente.attivo;
    return true; // 'tutti'
  });

  const handleSearch = () => {
    loadClienti();
  };

  const handleOpenModal = (cliente?: Cliente) => {
    if (cliente) {
      setEditingCliente(cliente);
      setFormData({
        tipoCliente: cliente.tipoCliente,
        ragioneSociale: cliente.ragioneSociale || '',
        partitaIva: cliente.partitaIva || '',
        nome: cliente.nome || '',
        cognome: cliente.cognome || '',
        codiceFiscale: cliente.codiceFiscale || '',
        indirizzo: cliente.indirizzo || '',
        email: cliente.email || '',
        telefono: cliente.telefono || '',
        note: cliente.note || '',
        attivo: cliente.attivo ?? true,
      });
    } else {
      setEditingCliente(null);
      setFormData({
        tipoCliente: TipoCliente.PERSONA_GIURIDICA,
        ragioneSociale: '',
        partitaIva: '',
        nome: '',
        cognome: '',
        codiceFiscale: '',
        indirizzo: '',
        email: '',
        telefono: '',
        note: '',
        attivo: true,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingCliente(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCliente) {
        await clientiService.update(editingCliente.id, formData);
      } else {
        await clientiService.create(formData);
      }
      handleCloseModal();
      loadClienti();
    } catch (error) {
      console.error('Errore nel salvataggio del cliente:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Sei sicuro di voler eliminare questo cliente?')) {
      try {
        await clientiService.delete(id);
        loadClienti();
      } catch (error) {
        console.error('Errore nell\'eliminazione del cliente:', error);
      }
    }
  };

  const isPF = formData.tipoCliente === TipoCliente.PERSONA_FISICA;

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
        <h1 className="text-3xl font-bold text-gray-900">Clienti</h1>
        <Button onClick={() => handleOpenModal()}>
          <Plus size={20} className="mr-2" />
          Nuovo Cliente
        </Button>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col space-y-3">
          <div className="flex space-x-2">
            <div className="flex-1">
              <Input
                placeholder="Cerca per nome, ragione sociale, P.IVA, C.F. o email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch}>
              <Search size={20} className="mr-2" />
              Cerca
            </Button>
          </div>
          {/* Filtro Attivo */}
          <div className="flex items-center space-x-6">
            <span className="text-sm font-medium text-gray-700">Mostra:</span>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="filtroAttivo"
                value="attivi"
                checked={filtroAttivo === 'attivi'}
                onChange={() => setFiltroAttivo('attivi')}
                className="mr-2 text-blue-600 focus:ring-blue-500"
              />
              <CheckCircle size={16} className="mr-1 text-green-600" />
              <span className="text-sm text-gray-700">Solo attivi</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="filtroAttivo"
                value="nonAttivi"
                checked={filtroAttivo === 'nonAttivi'}
                onChange={() => setFiltroAttivo('nonAttivi')}
                className="mr-2 text-blue-600 focus:ring-blue-500"
              />
              <XCircle size={16} className="mr-1 text-red-500" />
              <span className="text-sm text-gray-700">Solo non attivi</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="filtroAttivo"
                value="tutti"
                checked={filtroAttivo === 'tutti'}
                onChange={() => setFiltroAttivo('tutti')}
                className="mr-2 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Tutti</span>
            </label>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tipo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nome / Ragione Sociale
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                P.IVA / C.F.
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Telefono
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Attivo
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Azioni
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {clientiFiltrati.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  {clienti.length === 0 ? 'Nessun cliente trovato' : 'Nessun cliente corrisponde al filtro selezionato'}
                </td>
              </tr>
            ) : (
              clientiFiltrati.map((cliente) => (
                <tr key={cliente.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {cliente.tipoCliente === TipoCliente.PERSONA_FISICA ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        <User size={12} className="mr-1" />
                        PF
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        <Building2 size={12} className="mr-1" />
                        PG
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {getClienteDisplayName(cliente)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {cliente.tipoCliente === TipoCliente.PERSONA_FISICA
                      ? cliente.codiceFiscale || '-'
                      : cliente.partitaIva || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {cliente.email || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {cliente.telefono || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {cliente.attivo ? (
                      <CheckCircle size={20} className="inline text-green-600" />
                    ) : (
                      <XCircle size={20} className="inline text-red-500" />
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleOpenModal(cliente)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(cliente.id)}
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
                {editingCliente ? 'Modifica Cliente' : 'Nuovo Cliente'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {/* Tipo Cliente */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo Cliente *
                </label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="tipoCliente"
                      value={TipoCliente.PERSONA_GIURIDICA}
                      checked={formData.tipoCliente === TipoCliente.PERSONA_GIURIDICA}
                      onChange={(e) => setFormData({ ...formData, tipoCliente: e.target.value as TipoCliente })}
                      className="mr-2"
                    />
                    <Building2 size={16} className="mr-1" />
                    Persona Giuridica
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="tipoCliente"
                      value={TipoCliente.PERSONA_FISICA}
                      checked={formData.tipoCliente === TipoCliente.PERSONA_FISICA}
                      onChange={(e) => setFormData({ ...formData, tipoCliente: e.target.value as TipoCliente })}
                      className="mr-2"
                    />
                    <User size={16} className="mr-1" />
                    Persona Fisica
                  </label>
                </div>
              </div>

              {/* Campi condizionali */}
              {isPF ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Cognome *"
                      value={formData.cognome}
                      onChange={(e) => setFormData({ ...formData, cognome: e.target.value })}
                      required
                    />
                    <Input
                      label="Nome *"
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      required
                    />
                  </div>
                  <Input
                    label="Codice Fiscale"
                    value={formData.codiceFiscale}
                    onChange={(e) => setFormData({ ...formData, codiceFiscale: e.target.value.toUpperCase() })}
                    maxLength={16}
                  />
                </>
              ) : (
                <>
                  <Input
                    label="Ragione Sociale *"
                    value={formData.ragioneSociale}
                    onChange={(e) => setFormData({ ...formData, ragioneSociale: e.target.value })}
                    required
                  />
                  <Input
                    label="Partita IVA"
                    value={formData.partitaIva}
                    onChange={(e) => setFormData({ ...formData, partitaIva: e.target.value })}
                    maxLength={11}
                  />
                </>
              )}

              {/* Campi comuni */}
              <Input
                label="Indirizzo"
                value={formData.indirizzo}
                onChange={(e) => setFormData({ ...formData, indirizzo: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                <Input
                  label="Telefono"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                />
              </div>
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
              {/* Toggle Attivo */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="text-sm font-medium text-gray-900">
                    Cliente Attivo
                  </label>
                  <p className="text-sm text-gray-500">
                    I clienti non attivi non saranno visibili nelle liste veicoli e scadenze
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, attivo: !formData.attivo })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    formData.attivo ? 'bg-green-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      formData.attivo ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="secondary" onClick={handleCloseModal}>
                  Annulla
                </Button>
                <Button type="submit">
                  {editingCliente ? 'Salva' : 'Crea'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
