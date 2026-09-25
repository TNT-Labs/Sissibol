import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  Info,
  Mail,
  RefreshCw,
  RotateCcw,
  Send,
  UserX,
  XCircle,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import { ResponsiveTable } from '../../components/common/ResponsiveTable';
import { useToast } from '../../context/ToastContext';
import { useIsAdmin } from '../../context/AuthContext';
import { getErrorMessage } from '../../utils/errors';
import { formattaImporto, haImporto, IMPORTO_MANCANTE } from '../../utils/importi';
import {
  avvisiService,
  ETICHETTA_TIPO,
} from '../../services/avvisi.service';
import type {
  AnteprimaAvviso,
  AvvisoInElenco,
  ClienteSenzaRecapito,
  EsitoInvio,
  StatoAvvisi,
} from '../../services/avvisi.service';
import type { EsitoAvviso } from '../../types';

type Scheda = 'DA_INVIARE' | 'ERRORE' | 'INVIATO' | 'ANNULLATO' | 'SENZA_EMAIL';

const SCHEDE: Array<{ id: Scheda; etichetta: string }> = [
  { id: 'DA_INVIARE', etichetta: 'Da inviare' },
  { id: 'ERRORE', etichetta: 'In errore' },
  { id: 'INVIATO', etichetta: 'Inviati' },
  { id: 'ANNULLATO', etichetta: 'Annullati' },
  { id: 'SENZA_EMAIL', etichetta: 'Clienti senza email' },
];

/** Date delle colonne DATE: arrivano a mezzanotte UTC, vanno lette in UTC. */
const formattaGiorno = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('it-IT', { timeZone: 'UTC' }) : '-';

const formattaIstante = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

const nomeCliente = (c: AvvisoInElenco['scadenza']['veicolo']['cliente']) =>
  c.ragioneSociale?.trim() || [c.cognome, c.nome].filter(Boolean).join(' ') || 'Cliente';

const conta = (n: number, singolare: string, plurale: string) => `${n} ${n === 1 ? singolare : plurale}`;

/** Riassunto leggibile di un invio. */
function descriviInvio(esito: EsitoInvio): string {
  if (esito.smtpNonConfigurato) return 'Server di posta non configurato.';
  if (esito.giaInCorso) return 'Un invio è già in corso: riprovare fra qualche minuto.';
  const parti = [
    `${conta(esito.emailInviate, 'email inviata', 'email inviate')} (${conta(esito.avvisiInviati, 'avviso', 'avvisi')})`,
  ];
  if (esito.annullati) parti.push(conta(esito.annullati, 'annullato', 'annullati'));
  if (esito.errori) parti.push(`${esito.errori} in errore`);
  if (esito.daRitentare) parti.push(`${esito.daRitentare} da ritentare`);
  if (esito.recuperatiIncerti) parti.push(`${esito.recuperatiIncerti} con esito incerto`);
  if (esito.clientiRimandati) parti.push(`${conta(esito.clientiRimandati, 'cliente', 'clienti')} al prossimo giro`);
  return parti.join(', ') + '.';
}

const BadgeEsito: React.FC<{ avviso: AvvisoInElenco }> = ({ avviso }) => {
  const stili: Record<EsitoAvviso, string> = {
    DA_INVIARE: 'bg-blue-100 text-blue-800',
    IN_INVIO: 'bg-purple-100 text-purple-800',
    INVIATO: 'bg-green-100 text-green-800',
    ERRORE: 'bg-red-100 text-red-800',
    ANNULLATO: 'bg-gray-100 text-gray-700',
  };
  const etichette: Record<EsitoAvviso, string> = {
    DA_INVIARE: 'Da inviare',
    IN_INVIO: 'In invio',
    INVIATO: 'Inviato',
    ERRORE: 'Errore',
    ANNULLATO: 'Annullato',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${stili[avviso.esito]}`}>
      {etichette[avviso.esito]}
    </span>
  );
};

/** Il dettaglio che conta per ciascun esito: errore, motivo, data d'invio. */
const DettaglioAvviso: React.FC<{ avviso: AvvisoInElenco }> = ({ avviso }) => {
  if (avviso.esito === 'INVIATO') {
    return (
      <span className="text-sm text-gray-700">
        {avviso.canale === 'ARCHIVIO'
          ? `${formattaGiorno(avviso.dataInvio)} (archivio)`
          : formattaIstante(avviso.inviatoIl ?? avviso.dataInvio)}
      </span>
    );
  }
  if (avviso.esito === 'ERRORE') {
    return <span className="text-sm text-red-700 break-words">{avviso.errore}</span>;
  }
  if (avviso.esito === 'ANNULLATO') {
    return <span className="text-sm text-gray-600 break-words">{avviso.note}</span>;
  }
  if (avviso.prossimoTentativo) {
    return (
      <span className="text-sm text-amber-700 break-words">
        Nuovo tentativo dal {formattaIstante(avviso.prossimoTentativo)}
        {avviso.errore ? ` (${avviso.errore})` : ''}
      </span>
    );
  }
  return <span className="text-sm text-gray-500">In coda</span>;
};

export const AvvisiPage: React.FC = () => {
  const toast = useToast();
  const isAdmin = useIsAdmin();
  const [stato, setStato] = useState<StatoAvvisi | null>(null);
  const [scheda, setScheda] = useState<Scheda>('DA_INVIARE');
  const [avvisi, setAvvisi] = useState<AvvisoInElenco[]>([]);
  const [senzaEmail, setSenzaEmail] = useState<ClienteSenzaRecapito[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [operazione, setOperazione] = useState<string | null>(null);
  const [anteprima, setAnteprima] = useState<AnteprimaAvviso | null>(null);

  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      const [nuovoStato] = await Promise.all([
        avvisiService.stato(),
        scheda === 'SENZA_EMAIL'
          ? avvisiService.senzaRecapito().then(setSenzaEmail)
          : avvisiService.elenco(scheda).then(setAvvisi),
      ]);
      setStato(nuovoStato);
    } catch (error) {
      toast.error('Errore', getErrorMessage(error, 'Impossibile caricare gli avvisi'));
    } finally {
      setCaricamento(false);
    }
  }, [scheda, toast]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const esegui = async (nome: string, azione: () => Promise<void>) => {
    if (operazione) return;
    setOperazione(nome);
    try {
      await azione();
      await carica();
    } catch (error) {
      toast.error('Errore', getErrorMessage(error, 'Operazione non riuscita'));
    } finally {
      setOperazione(null);
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
      toast.success('Avvisi rimessi in coda', `${rimessi} avvisi partiranno al prossimo invio.`);
    });

  const annulla = (avviso: AvvisoInElenco) => {
    if (!window.confirm(`Annullare l'avviso per ${avviso.scadenza.veicolo.targa}? Non verrà inviato.`)) return;
    void esegui('annulla', async () => {
      await avvisiService.annulla(avviso.id);
      toast.success('Avviso annullato', 'L\'avviso non verrà inviato.');
    });
  };

  const apriAnteprima = async (avviso: AvvisoInElenco) => {
    try {
      setAnteprima(await avvisiService.anteprima(avviso.id));
    } catch (error) {
      toast.error('Errore', getErrorMessage(error, 'Impossibile mostrare l\'anteprima'));
    }
  };

  const conteggioScheda = (id: Scheda): number | null => {
    if (!stato) return null;
    switch (id) {
      case 'DA_INVIARE': return stato.conteggi.daInviare;
      case 'ERRORE': return stato.conteggi.errori;
      case 'ANNULLATO': return stato.conteggi.annullati;
      case 'SENZA_EMAIL': return stato.clientiSenzaRecapito;
      default: return null;
    }
  };

  const colonne = [
    {
      key: 'cliente',
      header: 'Cliente',
      mobileLabel: 'Cliente',
      render: (a: AvvisoInElenco) => (
        <span className="text-sm font-medium text-gray-900">{nomeCliente(a.scadenza.veicolo.cliente)}</span>
      ),
    },
    {
      key: 'veicolo',
      header: 'Veicolo e scadenza',
      mobileLabel: 'Veicolo',
      render: (a: AvvisoInElenco) => (
        <div className="text-sm">
          <div className="font-medium text-gray-900">{a.scadenza.veicolo.targa}</div>
          <div className="text-gray-500">
            {formattaGiorno(a.scadenza.dataScadenza)} ·{' '}
            {haImporto(a.scadenza.importoPrevisto) ? (
              formattaImporto(a.scadenza.importoPrevisto)
            ) : (
              <span className="text-amber-700" title={IMPORTO_MANCANTE.spiegazione}>
                {IMPORTO_MANCANTE.etichetta}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'tipo',
      header: 'Avviso',
      mobileLabel: 'Avviso',
      render: (a: AvvisoInElenco) => (
        <div className="flex flex-col items-end md:items-start gap-1">
          <span className="text-sm text-gray-700">{ETICHETTA_TIPO[a.tipo]}</span>
          <BadgeEsito avviso={a} />
        </div>
      ),
    },
    {
      key: 'destinatario',
      header: 'Destinatario',
      className: 'md:whitespace-normal md:max-w-[16rem]',
      mobileLabel: 'A',
      hideOnMobile: scheda !== 'INVIATO',
      render: (a: AvvisoInElenco) => (
        <span className="text-sm text-gray-700 break-words">
          {a.destinatario || a.scadenza.veicolo.cliente.email || '-'}
        </span>
      ),
    },
    {
      key: 'dettaglio',
      header: scheda === 'INVIATO' ? 'Inviato il' : 'Dettaglio',
      className: 'md:whitespace-normal md:min-w-[12rem] md:max-w-xs',
      mobileLabel: scheda === 'INVIATO' ? 'Inviato il' : 'Dettaglio',
      render: (a: AvvisoInElenco) => <DettaglioAvviso avviso={a} />,
    },
    {
      key: 'azioni',
      header: '',
      mobileLabel: '',
      render: (a: AvvisoInElenco) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {a.canale === 'EMAIL' && (
            <button
              type="button"
              onClick={() => void apriAnteprima(a)}
              className="p-2 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-50"
              title={a.esito === 'INVIATO' ? 'Contenuto inviato' : 'Anteprima email'}
              aria-label="Anteprima email"
            >
              <Eye size={18} />
            </button>
          )}
          {a.canale === 'EMAIL' && (a.esito === 'ERRORE' || a.esito === 'ANNULLATO') && (
            <button
              type="button"
              onClick={() => void rimettiInCoda([a.id])}
              disabled={!!operazione}
              className="p-2 text-gray-500 hover:text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50"
              title="Rimetti in coda"
              aria-label="Rimetti in coda"
            >
              <RotateCcw size={18} />
            </button>
          )}
          {(a.esito === 'DA_INVIARE' || a.esito === 'ERRORE') && (
            <button
              type="button"
              onClick={() => annulla(a)}
              disabled={!!operazione}
              className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
              title="Annulla avviso"
              aria-label="Annulla avviso"
            >
              <XCircle size={18} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
          <Mail className="mr-3 flex-shrink-0" size={32} />
          Avvisi ai clienti
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void matura()} disabled={!!operazione}>
            <span className="flex items-center">
              <RefreshCw size={18} className={`mr-2 ${operazione === 'matura' ? 'animate-spin' : ''}`} />
              Matura avvisi
            </span>
          </Button>
          {isAdmin && (
            <Button
              onClick={invia}
              disabled={!!operazione || !stato?.smtpConfigurato || !stato?.conteggi.daInviare}
              title={!stato?.smtpConfigurato ? 'Server di posta non configurato' : undefined}
            >
              <span className="flex items-center">
                <Send size={18} className="mr-2" />
                {operazione === 'invia' ? 'Invio in corso...' : 'Invia ora'}
              </span>
            </Button>
          )}
        </div>
      </div>

      {stato && <StatoInvio stato={stato} />}

      {stato && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          <Riquadro etichetta="Da inviare" valore={stato.conteggi.daInviare} onClick={() => setScheda('DA_INVIARE')} />
          <Riquadro
            etichetta="In errore"
            valore={stato.conteggi.errori}
            evidenzia={stato.conteggi.errori > 0}
            onClick={() => setScheda('ERRORE')}
          />
          <Riquadro etichetta="Inviati (30 giorni)" valore={stato.conteggi.inviatiUltimi30Giorni} onClick={() => setScheda('INVIATO')} />
          <Riquadro
            etichetta="Clienti senza email"
            valore={stato.clientiSenzaRecapito}
            evidenzia={stato.clientiSenzaRecapito > 0}
            onClick={() => setScheda('SENZA_EMAIL')}
          />
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="border-b border-gray-200 overflow-x-auto">
          <nav className="flex min-w-max" aria-label="Schede avvisi">
            {SCHEDE.map((s) => {
              const n = conteggioScheda(s.id);
              const attiva = scheda === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScheda(s.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
                    attiva
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  aria-current={attiva ? 'page' : undefined}
                >
                  {s.etichetta}
                  {n !== null && n > 0 && (
                    <span className="ml-2 inline-flex px-2 rounded-full text-xs bg-gray-100 text-gray-700">{n}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {scheda === 'ERRORE' && avvisi.some((a) => a.canale === 'EMAIL') && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3 bg-red-50 border-b border-red-100">
            <p className="text-sm text-red-800">
              Correggere la causa (email del cliente, server di posta) prima di rimettere in coda.
            </p>
            <Button
              size="sm"
              variant="secondary"
              disabled={!!operazione}
              onClick={() => {
                const ids = avvisi.filter((a) => a.canale === 'EMAIL').map((a) => a.id);
                if (window.confirm(`Rimettere in coda ${ids.length} avvisi in errore?`)) {
                  void rimettiInCoda(ids);
                }
              }}
            >
              <span className="flex items-center">
                <RotateCcw size={16} className="mr-2" />
                Rimetti in coda tutti
              </span>
            </Button>
          </div>
        )}

        {caricamento ? (
          <div className="flex justify-center items-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          </div>
        ) : scheda === 'SENZA_EMAIL' ? (
          <ElencoSenzaEmail clienti={senzaEmail} />
        ) : (
          <ResponsiveTable
            columns={colonne}
            data={avvisi}
            keyExtractor={(a) => a.id}
            emptyState={
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

      <Modal
        isOpen={anteprima !== null}
        onClose={() => setAnteprima(null)}
        title={anteprima?.inviato ? 'Email inviata' : 'Anteprima email'}
        maxWidth="2xl"
      >
        {anteprima && <DettaglioAnteprima anteprima={anteprima} />}
      </Modal>
    </div>
  );
};

const Riquadro: React.FC<{
  etichetta: string;
  valore: number;
  evidenzia?: boolean;
  onClick: () => void;
}> = ({ etichetta, valore, evidenzia, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="bg-white rounded-lg shadow p-4 sm:p-6 text-left hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
  >
    <div className="text-xs sm:text-sm font-medium text-gray-600">{etichetta}</div>
    <div className={`mt-1 sm:mt-2 text-2xl sm:text-3xl font-semibold ${evidenzia ? 'text-red-600' : 'text-gray-900'}`}>
      {valore}
    </div>
  </button>
);

const StatoInvio: React.FC<{ stato: StatoAvvisi }> = ({ stato }) => {
  let icona = <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />;
  let stile = 'bg-green-50 border-green-200 text-green-900';
  let messaggio = `Invio automatico attivo: ogni giorno alle ${stato.orario} (${stato.fusoOrario}), al massimo ${stato.maxEmailPerEsecuzione} email per giro.`;

  if (!stato.smtpConfigurato) {
    icona = <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />;
    stile = 'bg-amber-50 border-amber-200 text-amber-900';
    messaggio =
      'Server di posta non configurato: gli avvisi maturano ma non possono essere inviati. Configurare SMTP_HOST e SMTP_FROM sul server.';
  } else if (!stato.invioAutomatico) {
    icona = <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />;
    stile = 'bg-blue-50 border-blue-200 text-blue-900';
    messaggio = `Invio manuale: gli avvisi partono solo con "Invia ora". Maturano ogni giorno alle ${stato.orario}; per inviarli automaticamente impostare AVVISI_INVIO_AUTOMATICO=true.`;
  }

  return (
    <div className={`flex gap-3 p-4 border rounded-lg ${stile}`}>
      {icona}
      <div className="text-sm min-w-0">
        <p>{messaggio}</p>
        {stato.ultimaEsecuzione && (
          <p className="mt-1 opacity-80">
            Ultimo invio: {formattaIstante(stato.ultimaEsecuzione.quando)} — {descriviInvio(stato.ultimaEsecuzione.esito)}
            {stato.ultimaEsecuzione.esito.interrotto && ` Interrotto: ${stato.ultimaEsecuzione.esito.interrotto}`}
          </p>
        )}
      </div>
    </div>
  );
};

const ElencoSenzaEmail: React.FC<{ clienti: ClienteSenzaRecapito[] }> = ({ clienti }) => {
  if (clienti.length === 0) {
    return (
      <EmptyState
        type="generic"
        title="Tutti i clienti sono raggiungibili"
        description="Ogni cliente con scadenze nei prossimi 30 giorni ha un indirizzo email valido."
      />
    );
  }
  return (
    <div>
      <p className="px-4 py-3 text-sm text-gray-600 border-b border-gray-100">
        Questi clienti hanno scadenze nei prossimi 30 giorni ma nessun indirizzo email utilizzabile: non
        riceveranno avvisi finché non viene inserito.
      </p>
      <ul className="divide-y divide-gray-200">
        {clienti.map((c) => (
          <li key={c.idCliente} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <UserX size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{c.nome}</p>
                <p className="text-sm text-gray-500 break-words">
                  {c.email ? <span className="text-red-700 break-all">Email non valida: {c.email}</span> : 'Email mancante'}
                  {' · '}
                  {c.scadenze} {c.scadenze === 1 ? 'scadenza' : 'scadenze'}, la prima il {formattaGiorno(c.primaScadenza)}
                </p>
              </div>
            </div>
            <Link
              to={`/clienti?cerca=${encodeURIComponent(c.nome)}`}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap self-start sm:self-auto"
            >
              Completa l'email →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

const DettaglioAnteprima: React.FC<{ anteprima: AnteprimaAvviso }> = ({ anteprima }) => {
  if (!anteprima.email) {
    return (
      <div className="flex gap-3 p-4 bg-gray-50 rounded-lg text-sm text-gray-700">
        <Info size={20} className="text-gray-500 flex-shrink-0" />
        <p>{anteprima.motivo ?? 'Nessun contenuto disponibile.'}</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="font-medium text-gray-500">A</dt>
        <dd className="text-gray-900 break-all">{anteprima.destinatari.join(', ') || '-'}</dd>
        <dt className="font-medium text-gray-500">Oggetto</dt>
        <dd className="text-gray-900 break-words">{anteprima.email.oggetto}</dd>
      </dl>
      {!anteprima.inviato && anteprima.avvisi.length > 1 && (
        <p className="text-sm text-blue-800 bg-blue-50 rounded-lg px-3 py-2">
          Un'unica email per cliente: comprende {anteprima.avvisi.length} avvisi in coda.
        </p>
      )}
      <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-[50vh] overflow-y-auto">
        {anteprima.email.testo}
      </pre>
    </div>
  );
};
