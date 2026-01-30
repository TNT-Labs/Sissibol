import React, { useEffect, useState } from 'react';
import { utentiService } from '../../services/utenti.service';
import type { CreateUtenteRequest, UpdateUtenteRequest } from '../../services/utenti.service';
import { Ruolo } from '../../types';
import type { Utente } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Plus, X, Edit, Trash2, Shield, User } from 'lucide-react';

export const UtentiPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [utenti, setUtenti] = useState<Utente[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUtente, setEditingUtente] = useState<Utente | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    ruolo: Ruolo.OPERATORE as Ruolo,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUtenti();
  }, []);

  const loadUtenti = async () => {
    try {
      setLoading(true);
      const data = await utentiService.getAll();
      setUtenti(data);
    } catch (error) {
      console.error('Errore nel caricamento degli utenti:', error);
      setError('Errore nel caricamento degli utenti');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (utente?: Utente) => {
    if (utente) {
      setEditingUtente(utente);
      setFormData({
        email: utente.email,
        password: '',
        ruolo: utente.ruolo,
      });
    } else {
      setEditingUtente(null);
      setFormData({
        email: '',
        password: '',
        ruolo: Ruolo.OPERATORE,
      });
    }
    setError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUtente(null);
    setFormData({
      email: '',
      password: '',
      ruolo: Ruolo.OPERATORE,
    });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (editingUtente) {
        const updateData: UpdateUtenteRequest = {
          email: formData.email !== editingUtente.email ? formData.email : undefined,
          ruolo: formData.ruolo !== editingUtente.ruolo ? formData.ruolo : undefined,
        };
        // Includi la password solo se è stata inserita
        if (formData.password) {
          updateData.password = formData.password;
        }
        await utentiService.update(editingUtente.id, updateData);
      } else {
        if (!formData.password) {
          setError('La password è obbligatoria per i nuovi utenti');
          return;
        }
        const createData: CreateUtenteRequest = {
          email: formData.email,
          password: formData.password,
          ruolo: formData.ruolo,
        };
        await utentiService.create(createData);
      }
      handleCloseModal();
      loadUtenti();
    } catch (error: any) {
      console.error('Errore nel salvataggio dell\'utente:', error);
      const errorMessage = error.response?.data?.message || 'Errore nel salvataggio dell\'utente';
      setError(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage);
    }
  };

  const handleDelete = async (id: number) => {
    if (id === currentUser?.id) {
      alert('Non puoi eliminare il tuo stesso account');
      return;
    }

    if (window.confirm('Sei sicuro di voler eliminare questo utente?')) {
      try {
        await utentiService.delete(id);
        loadUtenti();
      } catch (error: any) {
        console.error('Errore nell\'eliminazione dell\'utente:', error);
        const errorMessage = error.response?.data?.message || 'Errore nell\'eliminazione dell\'utente';
        alert(errorMessage);
      }
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRuoloIcon = (ruolo: Ruolo) => {
    return ruolo === Ruolo.ADMIN ? (
      <Shield size={16} className="text-purple-600" />
    ) : (
      <User size={16} className="text-gray-600" />
    );
  };

  const getRuoloBadge = (ruolo: Ruolo) => {
    const baseClasses = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium';
    return ruolo === Ruolo.ADMIN
      ? `${baseClasses} bg-purple-100 text-purple-800`
      : `${baseClasses} bg-gray-100 text-gray-800`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestione Utenti</h1>
        <Button onClick={() => handleOpenModal()}>
          <Plus size={20} className="mr-2" />
          Nuovo Utente
        </Button>
      </div>

      {/* Tabella utenti */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ruolo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Data Creazione
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Azioni
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {utenti.map((utente) => (
              <tr key={utente.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <span className="text-sm font-medium text-gray-900">
                      {utente.email}
                    </span>
                    {utente.id === currentUser?.id && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                        Tu
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={getRuoloBadge(utente.ruolo)}>
                    {getRuoloIcon(utente.ruolo)}
                    {utente.ruolo === Ruolo.ADMIN ? 'Amministratore' : 'Operatore'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(utente.createdAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleOpenModal(utente)}
                    className="text-blue-600 hover:text-blue-900 mr-3"
                    title="Modifica utente"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(utente.id)}
                    className={`${
                      utente.id === currentUser?.id
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'text-red-600 hover:text-red-900'
                    }`}
                    title={utente.id === currentUser?.id ? 'Non puoi eliminare te stesso' : 'Elimina utente'}
                    disabled={utente.id === currentUser?.id}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {utenti.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  Nessun utente trovato
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal creazione/modifica */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {editingUtente ? 'Modifica Utente' : 'Nuovo Utente'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  label="Email *"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@esempio.com"
                  required
                />
              </div>
              <div>
                <Input
                  label={editingUtente ? 'Password (lascia vuoto per non modificare)' : 'Password *'}
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  required={!editingUtente}
                  minLength={6}
                />
                <p className="mt-1 text-sm text-gray-500">Minimo 6 caratteri</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ruolo *</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.ruolo}
                  onChange={(e) => setFormData({ ...formData, ruolo: e.target.value as Ruolo })}
                  required
                >
                  <option value={Ruolo.OPERATORE}>Operatore</option>
                  <option value={Ruolo.ADMIN}>Amministratore</option>
                </select>
                <p className="mt-1 text-sm text-gray-500">
                  {formData.ruolo === Ruolo.ADMIN
                    ? 'Gli amministratori possono gestire utenti e configurazioni'
                    : 'Gli operatori possono gestire clienti, veicoli e scadenze'}
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="secondary" onClick={handleCloseModal}>
                  Annulla
                </Button>
                <Button type="submit">
                  {editingUtente ? 'Salva Modifiche' : 'Crea Utente'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
