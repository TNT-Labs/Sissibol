import React from 'react';
import { Eye, RotateCcw, XCircle } from 'lucide-react';
import { ResponsiveTable } from '../../components/common/ResponsiveTable';
import { ETICHETTA_TIPO } from '../../services/avvisi.service';
import type { AvvisoInElenco } from '../../services/avvisi.service';
import type { EsitoAvviso } from '../../types';
import { formattaImporto, haImporto, IMPORTO_MANCANTE } from '../../utils/importi';
import { formattaGiorno, formattaIstante, nomeCliente } from './formato';
import type { Scheda } from './useAvvisi';

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

interface TabellaAvvisiProps {
  avvisi: AvvisoInElenco[];
  scheda: Scheda;
  /** Un'operazione è in corso: le azioni sono sospese. */
  occupato: boolean;
  vuoto: React.ReactNode;
  onAnteprima: (avviso: AvvisoInElenco) => void;
  onRimetti: (avviso: AvvisoInElenco) => void;
  onAnnulla: (avviso: AvvisoInElenco) => void;
}

/** Avvisi di una scheda: tabella su schermi larghi, schede sul telefono. */
export const TabellaAvvisi: React.FC<TabellaAvvisiProps> = ({
  avvisi,
  scheda,
  occupato,
  vuoto,
  onAnteprima,
  onRimetti,
  onAnnulla,
}) => {
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
              onClick={() => onAnteprima(a)}
              className="p-2 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-50"
              title={a.esito === 'INVIATO' ? 'Contenuto inviato' : 'Anteprima email'}
              aria-label={`Anteprima email per ${a.scadenza.veicolo.targa}`}
            >
              <Eye size={18} aria-hidden="true" />
            </button>
          )}
          {a.canale === 'EMAIL' && (a.esito === 'ERRORE' || a.esito === 'ANNULLATO') && (
            <button
              type="button"
              onClick={() => onRimetti(a)}
              disabled={occupato}
              className="p-2 text-gray-500 hover:text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50"
              title="Rimetti in coda"
              aria-label={`Rimetti in coda ${a.scadenza.veicolo.targa}`}
            >
              <RotateCcw size={18} aria-hidden="true" />
            </button>
          )}
          {(a.esito === 'DA_INVIARE' || a.esito === 'ERRORE') && (
            <button
              type="button"
              onClick={() => onAnnulla(a)}
              disabled={occupato}
              className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
              title="Annulla avviso"
              aria-label={`Annulla avviso per ${a.scadenza.veicolo.targa}`}
            >
              <XCircle size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return <ResponsiveTable columns={colonne} data={avvisi} keyExtractor={(a) => a.id} emptyState={vuoto} />;
};
