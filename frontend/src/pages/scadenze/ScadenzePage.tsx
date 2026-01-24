import React, { useEffect, useState, useMemo } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { scadenzeService } from '../../services/scadenze.service';
import { clientiService } from '../../services/clienti.service';
import { veicoliService } from '../../services/veicoli.service';
import { StatoScadenza } from '../../types';
import type { Scadenza, Cliente, Veicolo } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Plus, X, Calendar as CalendarIcon, List } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

moment.locale('it');
const localizer = momentLocalizer(moment);

interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resource: Scadenza;
}

export const ScadenzePage: React.FC = () => {
  const [scadenze, setScadenze] = useState<Scadenza[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [veicoli, setVeicoli] = useState<Veicolo[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [filterStato, setFilterStato] = useState<StatoScadenza | ''>('');
  const [filterCliente, setFilterCliente] = useState<number | undefined>();
  const [showModal, setShowModal] = useState(false);
  const [editingScadenza, setEditingScadenza] = useState<Scadenza | null>(null);
  const [formData, setFormData] = useState<{
    idVeicolo: number;
    dataScadenza: string;
    importoPrevisto: string;
    stato: StatoScadenza;
  }>({
    idVeicolo: 0,
    dataScadenza: '',
    importoPrevisto: '',
    stato: StatoScadenza.DA_PAGARE,
  });

  useEffect(() => {
    loadData();
  }, [filterStato, filterCliente]);

  const loadData = async () => {
    try {
      const [scadenzeData, clientiData, veicoliData] = await Promise.all([
        scadenzeService.getAll(filterStato || undefined, filterCliente),
        clientiService.getAll(),
        veicoliService.getAll(),
      ]);
      setScadenze(scadenzeData);
      setClienti(clientiData);
      setVeicoli(veicoliData);
    } catch (error) {
      console.error('Errore nel caricamento dei dati:', error);
    } finally {
      setLoading(false);
    }
  };

  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return scadenze.map((scadenza) => ({
      id: scadenza.id,
      title: `${scadenza.veicolo?.targa || 'N/A'} - ${scadenza.veicolo?.cliente?.ragioneSociale || 'N/A'}`,
      start: new Date(scadenza.dataScadenza),
      end: new Date(scadenza.dataScadenza),
      resource: scadenza,
    }));
  }, [scadenze]);

  const handleOpenModal = (scadenza?: Scadenza) => {
    if (scadenza) {
      setEditingScadenza(scadenza);
      setFormData({
        idVeicolo: scadenza.idVeicolo,
        dataScadenza: format(new Date(scadenza.dataScadenza), 'yyyy-MM-dd'),
        importoPrevisto: scadenza.importoPrevisto?.toString() || '',
        stato: scadenza.stato,
      });
    } else {
      setEditingScadenza(null);
      setFormData({
        idVeicolo: veicoli.length > 0 ? veicoli[0].id : 0,
        dataScadenza: format(new Date(), 'yyyy-MM-dd'),
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
        ...formData,
        importoPrevisto: formData.importoPrevisto ? parseFloat(formData.importoPrevisto) : undefined,
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

  const eventStyleGetter = (event: CalendarEvent) => {
    let backgroundColor = '#3182ce';
    const stato = event.resource.stato;

    if (stato === 'DA_PAGARE') backgroundColor = '#ecc94b';
    if (stato === 'PAGATO') backgroundColor = '#48bb78';
    if (stato === 'SCADUTO') backgroundColor = '#f56565';

    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block',
      },
    };
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
          <CalendarIcon className="mr-3" size={32} />
          Scadenziario
        </h1>
        <div className="flex space-x-2">
          <Button
            variant={view === 'calendar' ? 'primary' : 'secondary'}
            onClick={() => setView('calendar')}
          >
            <CalendarIcon size={20} className="mr-2" />
            Calendario
          </Button>
          <Button
            variant={view === 'list' ? 'primary' : 'secondary'}
            onClick={() => setView('list')}
          >
            <List size={20} className="mr-2" />
            Lista
          </Button>
          <Button onClick={() => handleOpenModal()}>
            <Plus size={20} className="mr-2" />
            Nuova Scadenza
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stato</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterStato}
              onChange={(e) => setFilterStato(e.target.value as StatoScadenza | '')}
            >
              <option value="">Tutti</option>
              <option value="DA_PAGARE">Da Pagare</option>
              <option value="PAGATO">Pagato</option>
              <option value="SCADUTO">Scaduto</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterCliente || ''}
              onChange={(e) => setFilterCliente(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">Tutti i clienti</option>
              {clienti.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.ragioneSociale}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Calendar View */}
      {view === 'calendar' && (
        <div className="bg-white rounded-lg shadow p-4" style={{ height: '700px' }}>
          <Calendar
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%' }}
            eventPropGetter={eventStyleGetter}
            onSelectEvent={(event: CalendarEvent) => handleOpenModal(event.resource)}
            messages={{
              next: 'Avanti',
              previous: 'Indietro',
              today: 'Oggi',
              month: 'Mese',
              week: 'Settimana',
              day: 'Giorno',
              agenda: 'Agenda',
              date: 'Data',
              time: 'Ora',
              event: 'Evento',
              noEventsInRange: 'Nessuna scadenza in questo periodo',
            }}
          />
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data Scadenza
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
                  Stato
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Azioni
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {scadenze.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    Nessuna scadenza trovata
                  </td>
                </tr>
              ) : (
                scadenze.map((scadenza) => (
                  <tr key={scadenza.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {format(new Date(scadenza.dataScadenza), 'dd/MM/yyyy', { locale: it })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {scadenza.veicolo?.cliente?.ragioneSociale || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {scadenza.veicolo?.targa || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {scadenza.importoPrevisto ? `€ ${scadenza.importoPrevisto}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatoColor(
                          scadenza.stato
                        )}`}
                      >
                        {scadenza.stato.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleOpenModal(scadenza)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        Modifica
                      </button>
                      <button
                        onClick={() => handleDelete(scadenza.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Elimina
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

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
                      {veicolo.targa} - {veicolo.cliente?.ragioneSociale}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Data Scadenza *"
                type="date"
                value={formData.dataScadenza}
                onChange={(e) => setFormData({ ...formData, dataScadenza: e.target.value })}
                required
              />
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
