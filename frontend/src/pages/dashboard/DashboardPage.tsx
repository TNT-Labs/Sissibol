import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { scadenzeService } from '../../services/scadenze.service';
import { Scadenza } from '../../types';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Calendar, AlertCircle, CheckCircle, Clock } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [scadenzeImminenti, setScadenzeImminenti] = useState<Scadenza[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScadenzeImminenti();
  }, []);

  const loadScadenzeImminenti = async () => {
    try {
      const data = await scadenzeService.getInScadenza(30);
      setScadenzeImminenti(data);
    } catch (error) {
      console.error('Errore nel caricamento delle scadenze:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatoColor = (stato: string) => {
    switch (stato) {
      case 'DA_PAGARE':
        return 'text-yellow-600 bg-yellow-50';
      case 'PAGATO':
        return 'text-green-600 bg-green-50';
      case 'SCADUTO':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatoIcon = (stato: string) => {
    switch (stato) {
      case 'DA_PAGARE':
        return <Clock size={16} />;
      case 'PAGATO':
        return <CheckCircle size={16} />;
      case 'SCADUTO':
        return <AlertCircle size={16} />;
      default:
        return null;
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
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
              <Clock size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">In scadenza (30gg)</p>
              <p className="text-2xl font-semibold text-gray-900">
                {scadenzeImminenti.length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100 text-green-600">
              <CheckCircle size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Pagati questo mese</p>
              <p className="text-2xl font-semibold text-gray-900">0</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-red-100 text-red-600">
              <AlertCircle size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Scaduti</p>
              <p className="text-2xl font-semibold text-gray-900">0</p>
            </div>
          </div>
        </div>
      </div>

      {/* Scadenze imminenti */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <Calendar className="mr-2" size={24} />
              Scadenze Imminenti (prossimi 30 giorni)
            </h2>
            <Link
              to="/scadenze"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Vedi tutte
            </Link>
          </div>
        </div>
        <div className="divide-y divide-gray-200">
          {scadenzeImminenti.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              Nessuna scadenza imminente
            </div>
          ) : (
            scadenzeImminenti.map((scadenza) => (
              <div key={scadenza.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {scadenza.veicolo?.cliente?.ragioneSociale}
                    </p>
                    <p className="text-sm text-gray-600">
                      Targa: {scadenza.veicolo?.targa}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {format(new Date(scadenza.dataScadenza), 'dd MMMM yyyy', { locale: it })}
                    </p>
                    <div className="mt-1">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${getStatoColor(
                          scadenza.stato
                        )}`}
                      >
                        {getStatoIcon(scadenza.stato)}
                        <span>{scadenza.stato.replace('_', ' ')}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
