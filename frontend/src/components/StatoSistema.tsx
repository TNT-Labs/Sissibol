import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Database, HardDrive, Mail, XCircle } from 'lucide-react';
import { sistemaService } from '../services/sistema.service';
import type { StatoSistema as Stato } from '../services/sistema.service';

const quando = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const dimensione = (byte: number) =>
  byte >= 1_048_576 ? `${(byte / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(byte / 1024))} KB`;

const Voce: React.FC<{ icona: React.ReactNode; titolo: string; ok: boolean | null; children: React.ReactNode }> = ({
  icona,
  titolo,
  ok,
  children,
}) => (
  <div className="flex items-start gap-3 min-w-0">
    <div
      className={`p-2 rounded-full flex-shrink-0 ${
        ok === null ? 'bg-gray-100 text-gray-500' : ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {icona}
    </div>
    <div className="min-w-0">
      <p className="text-sm font-medium text-gray-900">{titolo}</p>
      <div className="text-sm text-gray-600 break-words">{children}</div>
    </div>
  </div>
);

/**
 * Stato dell'installazione per gli amministratori. Mette in evidenza i
 * backup: se smettono di funzionare, qui lo si vede subito, non il giorno in
 * cui servono.
 */
export const StatoSistema: React.FC = () => {
  const [stato, setStato] = useState<Stato | null>(null);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    sistemaService
      .stato()
      .then(setStato)
      .catch(() => setErrore(true));
  }, []);

  if (errore) return null;
  if (!stato) return null;

  const { backup } = stato;
  const backupOk = backup.livello === 'OK' ? true : backup.livello === 'NON_CONFIGURATO' ? null : false;
  const problema = backup.livello === 'ERRORE' || backup.livello === 'ATTENZIONE' || !stato.database.raggiungibile;

  return (
    <div className={`bg-white rounded-lg shadow p-4 sm:p-6 ${problema ? 'ring-2 ring-red-300' : ''}`}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Stato del sistema</h2>
        {problema ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-red-700">
            <AlertTriangle size={16} /> Richiede attenzione
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700">
            <CheckCircle size={16} /> Tutto regolare
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Voce icona={<HardDrive size={18} />} titolo="Backup del database" ok={backupOk}>
          {backup.livello === 'OK' && backup.ultimoRiuscito ? (
            <>
              Ultimo: {quando(backup.ultimoRiuscito.quando)} ({dimensione(backup.ultimoRiuscito.dimensioneByte)})
              {backup.backupConservati !== null && <>, {backup.backupConservati} conservati</>}
            </>
          ) : (
            <>
              <span className={backup.livello === 'NON_CONFIGURATO' ? '' : 'text-red-700 font-medium'}>
                {backup.messaggio}
              </span>
              {backup.ultimoTentativo?.errore && (
                <span className="block text-xs text-gray-500 mt-0.5">{backup.ultimoTentativo.errore}</span>
              )}
              {backup.ultimoRiuscito && backup.livello !== 'NON_CONFIGURATO' && (
                <span className="block text-xs text-gray-500 mt-0.5">
                  Ultimo backup valido: {quando(backup.ultimoRiuscito.quando)}
                </span>
              )}
            </>
          )}
        </Voce>
        <Voce icona={<Database size={18} />} titolo="Database" ok={stato.database.raggiungibile}>
          {stato.database.raggiungibile ? 'Raggiungibile' : 'Non raggiungibile'}
        </Voce>
        <Voce
          icona={stato.posta.configurata ? <Mail size={18} /> : <XCircle size={18} />}
          titolo="Invio email"
          ok={stato.posta.configurata ? true : null}
        >
          {stato.posta.configurata ? 'Server di posta configurato' : 'Non configurato: avvisi e riepiloghi non partono'}
        </Voce>
      </div>
    </div>
  );
};
