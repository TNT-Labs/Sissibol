import React, { useEffect, useState } from 'react';
import { pagamentiService } from '../../services/pagamenti.service';
import { scadenzeService } from '../../services/scadenze.service';
import { StatoScadenza, getClienteDisplayName } from '../../types';
import type { Pagamento, Scadenza } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import type { SelectOption } from '../../components/common/SearchableSelect';
import { Plus, X, CreditCard, Upload, FileText, Trash2, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { getMeseLabel } from '../../constants/domini';
import { useToast } from '../../context/ToastContext';

export const PagamentiPage: React.FC = () => {
  const [pagamenti, setPagamenti] = useState<Pagamento[]>([]);
  const [scadenze, setScadenze] = useState<Scadenza[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPagamento, setEditingPagamento] = useState<Pagamento | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // BUG FIX: aggiunto stato isSubmitting per evitare submit multipli (race condition)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    idScadenza: 0,
    dataPagamento: '',
    importoPagato: '',
    metodoPagamento: '',
  });
  const toast = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [pagamentiData, scadenzeData] = await Promise.all([
        pagamentiService.getAll(),
        scadenzeService.getAll(StatoScadenza.DA_PAGARE),
      ]);
      setPagamenti(pagamentiData);
      setScadenze(scadenzeData);
    } catch (error) {
      console.error('Errore nel caricamento dei dati:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (pagamento?: Pagamento) => {
    if (pagamento) {
      setEditingPagamento(pagamento);
      setFormData({
        idScadenza: pagamento.idScadenza,
        dataPagamento: format(new Date(pagamento.dataPagamento), 'yyyy-MM-dd'),
        importoPagato: pagamento.importoPagato.toString(),
        metodoPagamento: pagamento.metodoPagamento || '',
      });
      setSelectedFile(null);
    } else {
      setEditingPagamento(null);
      setFormData({
        idScadenza: scadenze.length > 0 ? scadenze[0].id : 0,
        dataPagamento: format(new Date(), 'yyyy-MM-dd'),
        importoPagato: '',
        metodoPagamento: '',
      });
      setSelectedFile(null);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingPagamento(null);
    setSelectedFile(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      // Verifica tipo file (immagini e PDF)
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast.warning('Formato non supportato', 'Usa JPG, PNG o PDF.');
        return;
      }
      // Verifica dimensione (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.warning('File troppo grande', 'Dimensione massima: 5MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // BUG FIX: protezione contro submit multipli
    if (isSubmitting) return;

    // BUG FIX: validazione importo prima del submit
    const importo = parseFloat(formData.importoPagato);
    if (isNaN(importo) || importo <= 0) {
      toast.error('Errore', 'L\'importo deve essere un numero maggiore di 0');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = {
        idScadenza: formData.idScadenza,
        dataPagamento: formData.dataPagamento,
        importoPagato: importo,
        metodoPagamento: formData.metodoPagamento,
      };

      if (editingPagamento) {
        await pagamentiService.update(editingPagamento.id, data);
        toast.success('Pagamento aggiornato', 'Il pagamento è stato modificato con successo.');
      } else {
        await pagamentiService.create(data, selectedFile || undefined);
        toast.success('Pagamento registrato', 'Il pagamento è stato registrato con successo.');
      }
      handleCloseModal();
      loadData();
    } catch (error) {
      console.error('Errore nel salvataggio del pagamento:', error);
      toast.error('Errore', 'Impossibile salvare il pagamento. Riprova.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Sei sicuro di voler eliminare questo pagamento?')) {
      try {
        await pagamentiService.delete(id);
        toast.success('Pagamento eliminato', 'Il pagamento è stato eliminato con successo.');
        loadData();
      } catch (error) {
        console.error('Errore nell\'eliminazione del pagamento:', error);
        toast.error('Errore', 'Impossibile eliminare il pagamento. Riprova.');
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
          <CreditCard className="mr-3" size={32} />
          Pagamenti
        </h1>
        <Button onClick={() => handleOpenModal()}>
          <Plus size={20} className="mr-2" />
          Nuovo Pagamento
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-600">Totale Pagamenti</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900">{pagamenti.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-600">Importo Totale</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900">
            € {pagamenti.reduce((sum, p) => sum + Number(p.importoPagato), 0).toFixed(2)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-600">Scadenze da Pagare</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900">{scadenze.length}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Data Pagamento
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cliente
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Veicolo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Importo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Metodo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ricevuta
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Azioni
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {pagamenti.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  Nessun pagamento registrato
                </td>
              </tr>
            ) : (
              pagamenti.map((pagamento) => (
                <tr key={pagamento.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {format(new Date(pagamento.dataPagamento), 'dd/MM/yyyy', { locale: it })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {pagamento.scadenza?.veicolo?.cliente ? getClienteDisplayName(pagamento.scadenza.veicolo.cliente) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {pagamento.scadenza?.veicolo?.targa || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    € {Number(pagamento.importoPagato).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {pagamento.metodoPagamento || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {pagamento.ricevutaFile ? (
                      <a
                        href={`${import.meta.env.VITE_API_URL || ''}/${pagamento.ricevutaFile}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 flex items-center"
                      >
                        <FileText size={16} className="mr-1" />
                        Visualizza
                      </a>
                    ) : (
                      <span className="text-gray-400">Nessuna</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleOpenModal(pagamento)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(pagamento.id)}
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
                {editingPagamento ? 'Modifica Pagamento' : 'Nuovo Pagamento'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <SearchableSelect
                label="Scadenza *"
                options={(() => {
                  const opts: SelectOption[] = scadenze.map((scadenza) => ({
                    value: scadenza.id,
                    label: `${scadenza.veicolo?.targa} - ${scadenza.veicolo?.cliente ? getClienteDisplayName(scadenza.veicolo.cliente) : 'N/A'} - ${getMeseLabel(scadenza.meseScadenza)} ${scadenza.annoScadenza}`
                  }));
                  if (editingPagamento) {
                    opts.push({
                      value: editingPagamento.idScadenza,
                      label: `${editingPagamento.scadenza?.veicolo?.targa} - ${editingPagamento.scadenza?.veicolo?.cliente?.ragioneSociale || 'N/A'}`
                    });
                  }
                  return opts;
                })()}
                value={formData.idScadenza}
                onChange={(value) => setFormData({ ...formData, idScadenza: Number(value) })}
                placeholder="Cerca scadenza per targa o cliente..."
                required
                disabled={!!editingPagamento}
              />
              <Input
                label="Data Pagamento *"
                type="date"
                value={formData.dataPagamento}
                onChange={(e) => setFormData({ ...formData, dataPagamento: e.target.value })}
                required
              />
              <Input
                label="Importo Pagato *"
                type="number"
                step="0.01"
                value={formData.importoPagato}
                onChange={(e) => setFormData({ ...formData, importoPagato: e.target.value })}
                required
                placeholder="es. 150.00"
              />
              <Input
                label="Metodo di Pagamento"
                value={formData.metodoPagamento}
                onChange={(e) => setFormData({ ...formData, metodoPagamento: e.target.value })}
                placeholder="es. Bonifico, Contanti, Carta"
              />

              {!editingPagamento && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ricevuta (JPG, PNG, PDF - max 5MB)
                  </label>
                  <div className="mt-1 flex items-center space-x-2">
                    <label className="flex-1 cursor-pointer">
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                        <Upload className="mx-auto h-12 w-12 text-gray-400" />
                        <p className="mt-2 text-sm text-gray-600">
                          {selectedFile ? selectedFile.name : 'Clicca per caricare o trascina il file'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          JPG, PNG o PDF fino a 5MB
                        </p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept=".jpg,.jpeg,.png,.pdf"
                        onChange={handleFileChange}
                      />
                    </label>
                  </div>
                  {selectedFile && (
                    <div className="mt-2 flex items-center space-x-2 text-sm text-green-600">
                      <FileText size={16} />
                      <span>File selezionato: {selectedFile.name}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="secondary" onClick={handleCloseModal} disabled={isSubmitting}>
                  Annulla
                </Button>
                {/* BUG FIX: bottone disabilitato durante submit per evitare click multipli */}
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Salvataggio...' : (editingPagamento ? 'Salva' : 'Crea')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
