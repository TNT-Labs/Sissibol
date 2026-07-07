import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { clientiService } from '../../services/clienti.service';
import { TipoCliente, getClienteDisplayName } from '../../types';
import type { Cliente } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import { Plus, Edit, Trash2, Building2, User, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useDebounce } from '../../hooks/useDebounce';

type FiltroAttivo = 'tutti' | 'attivi' | 'nonAttivi';

const emptyFormData = {
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
};

export const ClientiPage: React.FC = () => {
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroAttivo, setFiltroAttivo] = useState<FiltroAttivo>('attivi');
  const [showModal, setShowModal] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState(emptyFormData);
  // BUG FIX: aggiunto stato isSubmitting per evitare submit multipli
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  // Debounce della ricerca per evitare troppe chiamate API
  const debouncedSearch = useDebounce(search, 300);

  // Carica clienti quando cambia la ricerca debounced
  useEffect(() => {
    loadClienti(debouncedSearch);
  }, [debouncedSearch]);

  const loadClienti = useCallback(async (searchTerm?: string) => {
    try {
      setLoading(true);
      const data = await clientiService.getAll(searchTerm);
      setClienti(data);
    } catch (error) {
      console.error('Errore nel caricamento dei clienti:', error);
      toast.error('Errore', 'Impossibile caricare i clienti.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Filtra i clienti in base al filtro attivo (memoizzato per performance)
  const clientiFiltrati = useMemo(() => {
    return clienti.filter((cliente) => {
      if (filtroAttivo === 'attivi') return cliente.attivo;
      if (filtroAttivo === 'nonAttivi') return !cliente.attivo;
      return true;
    });
  }, [clienti, filtroAttivo]);

  const handleOpenModal = useCallback((cliente?: Cliente) => {
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
      setFormData(emptyFormData);
    }
    setShowModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setEditingCliente(null);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    // BUG FIX: protezione contro submit multipli
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Converte le stringhe vuote in undefined: il backend valida i campi
      // opzionali (es. @IsEmail) anche se vuoti, e '' li farebbe fallire
      const isPersonaFisica = formData.tipoCliente === TipoCliente.PERSONA_FISICA;
      const payload = {
        tipoCliente: formData.tipoCliente,
        attivo: formData.attivo,
        ragioneSociale: !isPersonaFisica ? formData.ragioneSociale || undefined : undefined,
        partitaIva: !isPersonaFisica ? formData.partitaIva || undefined : undefined,
        nome: isPersonaFisica ? formData.nome || undefined : undefined,
        cognome: isPersonaFisica ? formData.cognome || undefined : undefined,
        codiceFiscale: isPersonaFisica ? formData.codiceFiscale || undefined : undefined,
        indirizzo: formData.indirizzo || undefined,
        email: formData.email || undefined,
        telefono: formData.telefono || undefined,
        note: formData.note || undefined,
      };

      if (editingCliente) {
        await clientiService.update(editingCliente.id, payload);
        toast.success('Cliente aggiornato', 'I dati del cliente sono stati salvati.');
      } else {
        await clientiService.create(payload);
        toast.success('Cliente creato', 'Il nuovo cliente è stato aggiunto.');
      }
      handleCloseModal();
      loadClienti(debouncedSearch);
    } catch (error) {
      console.error('Errore nel salvataggio del cliente:', error);
      toast.error('Errore', 'Impossibile salvare il cliente. Riprova.');
    } finally {
      setIsSubmitting(false);
    }
  }, [editingCliente, formData, handleCloseModal, loadClienti, debouncedSearch, toast, isSubmitting]);

  const handleDelete = useCallback(async (id: number) => {
    if (confirm('Sei sicuro di voler eliminare questo cliente?')) {
      try {
        await clientiService.delete(id);
        toast.success('Cliente eliminato', 'Il cliente è stato rimosso.');
        loadClienti(debouncedSearch);
      } catch (error) {
        console.error('Errore nell\'eliminazione del cliente:', error);
        toast.error('Errore', 'Impossibile eliminare il cliente. Potrebbe avere veicoli associati.');
      }
    }
  }, [loadClienti, debouncedSearch, toast]);

  // Handlers memoizzati per evitare re-render
  const handleEditClick = useCallback((cliente: Cliente) => () => handleOpenModal(cliente), [handleOpenModal]);
  const handleDeleteClick = useCallback((id: number) => () => handleDelete(id), [handleDelete]);
  const handleNewClick = useCallback(() => handleOpenModal(), [handleOpenModal]);

  const updateFormField = useCallback(<K extends keyof typeof formData>(field: K, value: typeof formData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const isPF = formData.tipoCliente === TipoCliente.PERSONA_FISICA;

  if (loading && clienti.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Clienti</h1>
        <Button onClick={handleNewClick}>
          <Plus size={20} className="mr-2" />
          Nuovo Cliente
        </Button>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col space-y-3">
          <div className="w-full">
            <Input
              placeholder="Cerca per nome, ragione sociale, P.IVA, C.F. o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* Filtro Attivo */}
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
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

      {/* Table Desktop / Cards Mobile */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {clientiFiltrati.length === 0 ? (
          <EmptyState
            type={clienti.length === 0 ? 'clienti' : 'filter'}
            title={clienti.length === 0 ? undefined : 'Nessun cliente corrisponde ai filtri'}
            description={clienti.length === 0 ? undefined : 'Prova a modificare i filtri o i termini di ricerca.'}
            actionLabel={clienti.length === 0 ? 'Aggiungi Cliente' : undefined}
            onAction={clienti.length === 0 ? handleNewClick : undefined}
          />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome / Ragione Sociale</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P.IVA / C.F.</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Telefono</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Attivo</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clientiFiltrati.map((cliente) => (
                    <tr key={cliente.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {cliente.tipoCliente === TipoCliente.PERSONA_FISICA ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            <User size={12} className="mr-1" />PF
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <Building2 size={12} className="mr-1" />PG
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {getClienteDisplayName(cliente)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {cliente.tipoCliente === TipoCliente.PERSONA_FISICA ? cliente.codiceFiscale || '-' : cliente.partitaIva || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cliente.email || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cliente.telefono || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {cliente.attivo ? <CheckCircle size={20} className="inline text-green-600" /> : <XCircle size={20} className="inline text-red-500" />}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={handleEditClick(cliente)} className="text-blue-600 hover:text-blue-900 mr-4" aria-label="Modifica">
                          <Edit size={18} />
                        </button>
                        <button onClick={handleDeleteClick(cliente.id)} className="text-red-600 hover:text-red-900" aria-label="Elimina">
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-200">
              {clientiFiltrati.map((cliente) => (
                <div key={cliente.id} className="p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        {cliente.tipoCliente === TipoCliente.PERSONA_FISICA ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            <User size={12} className="mr-1" />PF
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <Building2 size={12} className="mr-1" />PG
                          </span>
                        )}
                        {cliente.attivo ? <CheckCircle size={16} className="text-green-600" /> : <XCircle size={16} className="text-red-500" />}
                      </div>
                      <p className="font-medium text-gray-900 mt-1">{getClienteDisplayName(cliente)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleEditClick(cliente)} className="text-blue-600 p-2" aria-label="Modifica">
                        <Edit size={18} />
                      </button>
                      <button onClick={handleDeleteClick(cliente.id)} className="text-red-600 p-2" aria-label="Elimina">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 space-y-1">
                    <p>{cliente.tipoCliente === TipoCliente.PERSONA_FISICA ? cliente.codiceFiscale : cliente.partitaIva}</p>
                    {cliente.email && <p>{cliente.email}</p>}
                    {cliente.telefono && <p>{cliente.telefono}</p>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal Accessibile */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingCliente ? 'Modifica Cliente' : 'Nuovo Cliente'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo Cliente */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo Cliente *</label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="tipoCliente"
                  value={TipoCliente.PERSONA_GIURIDICA}
                  checked={formData.tipoCliente === TipoCliente.PERSONA_GIURIDICA}
                  onChange={(e) => updateFormField('tipoCliente', e.target.value as TipoCliente)}
                  className="mr-2"
                />
                <Building2 size={16} className="mr-1" />
                Persona Giuridica
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="tipoCliente"
                  value={TipoCliente.PERSONA_FISICA}
                  checked={formData.tipoCliente === TipoCliente.PERSONA_FISICA}
                  onChange={(e) => updateFormField('tipoCliente', e.target.value as TipoCliente)}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Cognome *"
                  value={formData.cognome}
                  onChange={(e) => updateFormField('cognome', e.target.value)}
                  required
                />
                <Input
                  label="Nome *"
                  value={formData.nome}
                  onChange={(e) => updateFormField('nome', e.target.value)}
                  required
                />
              </div>
              <Input
                label="Codice Fiscale"
                value={formData.codiceFiscale}
                onChange={(e) => updateFormField('codiceFiscale', e.target.value.toUpperCase())}
                maxLength={16}
              />
            </>
          ) : (
            <>
              <Input
                label="Ragione Sociale *"
                value={formData.ragioneSociale}
                onChange={(e) => updateFormField('ragioneSociale', e.target.value)}
                required
              />
              <Input
                label="Partita IVA"
                value={formData.partitaIva}
                onChange={(e) => updateFormField('partitaIva', e.target.value)}
                maxLength={11}
              />
            </>
          )}

          {/* Campi comuni */}
          <Input
            label="Indirizzo"
            value={formData.indirizzo}
            onChange={(e) => updateFormField('indirizzo', e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => updateFormField('email', e.target.value)}
            />
            <Input
              label="Telefono"
              value={formData.telefono}
              onChange={(e) => updateFormField('telefono', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              value={formData.note}
              onChange={(e) => updateFormField('note', e.target.value)}
            />
          </div>

          {/* Toggle Attivo */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="text-sm font-medium text-gray-900">Cliente Attivo</label>
              <p className="text-sm text-gray-500">I clienti non attivi non saranno visibili nelle liste veicoli e scadenze</p>
            </div>
            <button
              type="button"
              onClick={() => updateFormField('attivo', !formData.attivo)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${formData.attivo ? 'bg-green-600' : 'bg-gray-200'}`}
              role="switch"
              aria-checked={formData.attivo}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.attivo ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="secondary" onClick={handleCloseModal} disabled={isSubmitting}>Annulla</Button>
            {/* BUG FIX: bottone disabilitato durante submit */}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Salvataggio...' : (editingCliente ? 'Salva' : 'Crea')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
