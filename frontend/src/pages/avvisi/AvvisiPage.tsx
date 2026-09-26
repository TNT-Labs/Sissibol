import React, { useState } from 'react';
import { Mail, RefreshCw, RotateCcw, Send } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../context/ToastContext';
import { useIsAdmin } from '../../context/AuthContext';
import { getErrorMessage } from '../../utils/errors';
import { avvisiService } from '../../services/avvisi.service';
import type { AnteprimaAvviso, AvvisoInElenco } from '../../services/avvisi.service';
import { AnteprimaModal } from './AnteprimaModal';
import { ElencoSenzaEmail } from './ElencoSenzaEmail';
import { conta, descriviInvio } from './formato';
import { Riquadro } from './Riquadro';
import { StatoInvio } from './StatoInvio';
import { TabellaAvvisi } from './TabellaAvvisi';
import { useAvvisi, type Scheda } from './useAvvisi';

const SCHEDE: Array<{ id: Scheda; etichetta: string }> = [
  { id: 'DA_INVIARE', etichetta: 'Da inviare' },
  { id: 'ERRORE', etichetta: 'In errore' },
  { id: 'INVIATO', etichetta: 'Inviati' },
  { id: 'ANNULLATO', etichetta: 'Annullati' },
  { id: 'SENZA_EMAIL', etichetta: 'Clienti senza email' },
];

/**
 * Avvisi ai clienti: stato dell'invio, conteggi e avvisi per esito.
 * La pagina coordina; dati, tabella, riquadri e modale sono separati.
 */
export const AvvisiPage: React.FC = () => {
  const toast = useToast();
  const admin = useIsAdmin();
  const [scheda, setScheda] = useState<Scheda>('DA_INVIARE');
  const { stato, avvisi, senzaEmail, caricamento, aggiornamento, errore, ricarica } = useAvvisi(scheda);
  const [operazione, setOperazione] = useState<string | null>(null);
  const [anteprima, setAnteprima] = useState<AnteprimaAvviso | null>(null);
  const occupato = operazione !== null || aggiornamento;

  const esegui = async (nome: string, azione: () => Promise<void>) => {
    if (operazione) return;
    setOperazione(nome);
    try {
      await azione();
    } catch (error) {
      toast.error('Operazione non riuscita', getErrorMessage(error, 'Riprova tra qualche istante.'));
    } finally {
      setOperazione(null);
      ricarica();
    }
  };

  const matura = () =>
    esegui('matura', async () => {
      const esito = await avvisiService.genera();
      const extra = [
        esito.senzaDestinatario ? `${conta(esito.senzaDestinatario, 'scadenza', 'scadenze')} senza email` : '',
        esito.esclusiPerScelta
          ? `${conta(esito.esclusiPerScelta, 'scadenza', 'scadenze')} di clienti che non ricevono avvisi`
          : '',
      ].filter(Boolean);
      const chiusi = esito.chiusi
        ? ` ${conta(esito.chiusi, 'avviso non più dovuto chiuso', 'avvisi non più dovuti chiusi')}.`
        : '';
      toast.success(
        'Avvisi maturati',
        `${conta(esito.avvisiCreati, 'nuovo avviso', 'nuovi avvisi')}.${extra.length ? ` Esclusi: ${extra.join(', ')}.` : ''}${chiusi}`,
      );
    });

  const invia = () => {
    const daInviare = stato?.conteggi.daInviare ?? 0;
    if (!window.confirm(`Inviare ora via email gli avvisi in coda (${daInviare}) ai clienti?`)) return;
    void esegui('invia', async () => {
      const esito = await avvisiService.invia();
      if (esito.interrotto) {
        toast.error('Invio interrotto', `Problema del server di posta: ${esito.interrotto}. ${descriviInvio(esito)}`);
      } else if (esito.errori || esito.giaInCorso || esito.smtpNonConfigurato) {
        toast.warning('Invio completato con avvisi', descriviInvio(esito));
      } else {
        toast.success('Invio completato', descriviInvio(esito));
      }
    });
  };

  const rimettiInCoda = (ids: number[]) =>
    esegui('rimetti', async () => {
      const { rimessi } = await avvisiService.rimettiInCoda(ids);
      toast.success('Avvisi rimessi in coda', `${conta(rimessi, 'avviso partirà', 'avvisi partiranno')} al prossimo invio.`);
    });

  const annulla = (avviso: AvvisoInElenco) => {
    if (!window.confirm(`Annullare l'avviso per ${avviso.scadenza.veicolo.targa}? Non verrà inviato.`)) return;
    void esegui('annulla', async () => {
      await avvisiService.annulla(avviso.id);
      toast.success('Avviso annullato', "L'avviso non verrà inviato.");
    });
  };

  const apriAnteprima = async (avviso: AvvisoInElenco) => {
    try {
      setAnteprima(await avvisiService.anteprima(avviso.id));
    } catch (error) {
      toast.error('Anteprima non disponibile', getErrorMessage(error, 'Riprova tra qualche istante.'));
    }
  };

  const conteggioScheda = (id: Scheda): number | null => {
    if (!stato) return null;
    switch (id) {
      case 'DA_INVIARE':
        return stato.conteggi.daInviare;
      case 'ERRORE':
        return stato.conteggi.errori;
      case 'ANNULLATO':
        return stato.conteggi.annullati;
      case 'SENZA_EMAIL':
        return stato.clientiSenzaRecapito;
      default:
        return null;
    }
  };

  const inErroreEmail = scheda === 'ERRORE' && !caricamento ? avvisi.filter((a) => a.canale === 'EMAIL') : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
          <Mail className="mr-3 flex-shrink-0" size={30} aria-hidden="true" />
          Avvisi ai clienti
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void matura()} disabled={operazione !== null}>
            <RefreshCw size={18} className={`mr-2 ${operazione === 'matura' ? 'animate-spin' : ''}`} aria-hidden="true" />
            Matura avvisi
          </Button>
          {admin && (
            <Button
              onClick={invia}
              disabled={operazione !== null || !stato?.smtpConfigurato || !stato?.conteggi.daInviare}
              title={stato && !stato.smtpConfigurato ? 'Server di posta non configurato' : undefined}
            >
              <Send size={18} className="mr-2" aria-hidden="true" />
              {operazione === 'invia' ? 'Invio in corso...' : 'Invia ora'}
            </Button>
          )}
        </div>
      </div>

      {stato && <StatoInvio stato={stato} />}

      {stato && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          <Riquadro
            etichetta="Da inviare"
            valore={stato.conteggi.daInviare}
            attivo={scheda === 'DA_INVIARE'}
            onClick={() => setScheda('DA_INVIARE')}
          />
          <Riquadro
            etichetta="In errore"
            valore={stato.conteggi.errori}
            evidenzia={stato.conteggi.errori > 0}
            attivo={scheda === 'ERRORE'}
            onClick={() => setScheda('ERRORE')}
          />
          <Riquadro
            etichetta="Inviati (30 giorni)"
            valore={stato.conteggi.inviatiUltimi30Giorni}
            attivo={scheda === 'INVIATO'}
            onClick={() => setScheda('INVIATO')}
          />
          <Riquadro
            etichetta="Clienti senza email"
            valore={stato.clientiSenzaRecapito}
            evidenzia={stato.clientiSenzaRecapito > 0}
            attivo={scheda === 'SENZA_EMAIL'}
            onClick={() => setScheda('SENZA_EMAIL')}
          />
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="border-b border-gray-200 overflow-x-auto">
          <div className="flex min-w-max" role="tablist" aria-label="Avvisi per esito">
            {SCHEDE.map((s) => {
              const n = conteggioScheda(s.id);
              const attiva = scheda === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={attiva}
                  onClick={() => setScheda(s.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
                    attiva
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {s.etichetta}
                  {n !== null && n > 0 && (
                    <span className="ml-2 inline-flex px-2 rounded-full text-xs bg-gray-100 text-gray-700">{n}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {inErroreEmail.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3 bg-red-50 border-b border-red-100">
            <p className="text-sm text-red-800">
              Correggere la causa (email del cliente, server di posta) prima di rimettere in coda.
            </p>
            <Button
              size="sm"
              variant="secondary"
              disabled={occupato}
              onClick={() => {
                if (window.confirm(`Rimettere in coda ${conta(inErroreEmail.length, 'avviso', 'avvisi')} in errore?`)) {
                  void rimettiInCoda(inErroreEmail.map((a) => a.id));
                }
              }}
            >
              <RotateCcw size={16} className="mr-2" aria-hidden="true" />
              Rimetti in coda tutti
            </Button>
          </div>
        )}

        <div role="tabpanel" aria-busy={caricamento || aggiornamento}>
          {caricamento ? (
            <div className="flex justify-center items-center h-48" role="status" aria-label="Caricamento">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
          ) : errore ? (
            <div className="px-6 py-12 text-center" role="alert">
              <p className="text-red-700">Impossibile caricare gli avvisi.</p>
              <Button variant="secondary" className="mt-4" onClick={ricarica}>
                <RotateCcw size={16} className="mr-2" aria-hidden="true" />
                Riprova
              </Button>
            </div>
          ) : (
            <div className={`transition-opacity ${aggiornamento ? 'opacity-60' : ''}`}>
              {scheda === 'SENZA_EMAIL' ? (
                <ElencoSenzaEmail clienti={senzaEmail} />
              ) : (
                <TabellaAvvisi
                  avvisi={avvisi}
                  scheda={scheda}
                  occupato={occupato}
                  onAnteprima={(a) => void apriAnteprima(a)}
                  onRimetti={(a) => void rimettiInCoda([a.id])}
                  onAnnulla={annulla}
                  vuoto={
                    <EmptyState
                      type="generic"
                      title="Nessun avviso"
                      description={
                        scheda === 'DA_INVIARE'
                          ? 'Non ci sono avvisi in coda. Gli avvisi maturano 30 e 7 giorni prima di ogni scadenza.'
                          : 'Nessun avviso in questo stato.'
                      }
                    />
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>

      {anteprima && <AnteprimaModal anteprima={anteprima} onClose={() => setAnteprima(null)} />}
    </div>
  );
};
