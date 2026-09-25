import { api } from './api';
import type { Avviso, EsitoAvviso, TipoAvviso } from '../types';

/** Avviso con i dati della scadenza, come restituito dall'elenco. */
export interface AvvisoInElenco extends Avviso {
  scadenza: {
    id: number;
    dataScadenza: string;
    importoPrevisto: number | string | null;
    stato: string;
    veicolo: {
      id: number;
      targa: string;
      cliente: {
        id: number;
        ragioneSociale?: string | null;
        nome?: string | null;
        cognome?: string | null;
        email?: string | null;
      };
    };
  };
}

export interface EsitoInvio {
  emailInviate: number;
  avvisiInviati: number;
  annullati: number;
  errori: number;
  daRitentare: number;
  recuperatiIncerti: number;
  clientiRimandati: number;
  interrotto: string | null;
  giaInCorso: boolean;
  smtpNonConfigurato: boolean;
}

export interface EsitoGenerazione {
  scadenzeEsaminate: number;
  avvisiCreati: number;
  avvisiGiaPresenti: number;
  senzaDestinatario: number;
  esclusiPerScelta: number;
  /** Secondi avvisi nati già assorbiti dal primo */
  assorbiti: number;
  /** Avvisi in coda chiusi perché non più dovuti (scadenza pagata...) */
  chiusi: number;
}

export interface StatoAvvisi {
  smtpConfigurato: boolean;
  invioAutomatico: boolean;
  orario: string;
  fusoOrario: string;
  maxEmailPerEsecuzione: number;
  conteggi: {
    daInviare: number;
    inInvio: number;
    errori: number;
    annullati: number;
    inviati: number;
    inviatiUltimi30Giorni: number;
  };
  clientiSenzaRecapito: number;
  ultimaEsecuzione: { quando: string; esito: EsitoInvio } | null;
}

export interface ClienteSenzaRecapito {
  idCliente: number;
  nome: string;
  email: string | null;
  scadenze: number;
  primaScadenza: string;
}

export interface AnteprimaAvviso {
  inviato: boolean;
  destinatari: string[];
  avvisi: number[];
  email: { oggetto: string; testo: string; html: string } | null;
  motivo: string | null;
}

export const ETICHETTA_TIPO: Record<TipoAvviso, string> = {
  PRIMO: 'Primo avviso',
  SECONDO: 'Secondo avviso',
  SOLLECITO: 'Sollecito',
};

export const avvisiService = {
  async stato(): Promise<StatoAvvisi> {
    return (await api.get<StatoAvvisi>('/avvisi/stato')).data;
  },

  async elenco(esito: EsitoAvviso): Promise<AvvisoInElenco[]> {
    return (await api.get<AvvisoInElenco[]>('/avvisi', { params: { esito } })).data;
  },

  async senzaRecapito(): Promise<ClienteSenzaRecapito[]> {
    return (await api.get<ClienteSenzaRecapito[]>('/avvisi/senza-recapito')).data;
  },

  async anteprima(id: number): Promise<AnteprimaAvviso> {
    return (await api.get<AnteprimaAvviso>(`/avvisi/${id}/anteprima`)).data;
  },

  async genera(): Promise<EsitoGenerazione> {
    return (await api.post<EsitoGenerazione>('/avvisi/genera')).data;
  },

  async invia(): Promise<EsitoInvio> {
    return (await api.post<EsitoInvio>('/avvisi/invia')).data;
  },

  async rimettiInCoda(ids: number[]): Promise<{ rimessi: number }> {
    return (await api.post<{ rimessi: number }>('/avvisi/rimetti-in-coda', { ids })).data;
  },

  async annulla(id: number): Promise<Avviso> {
    return (await api.post<Avviso>(`/avvisi/${id}/annulla`)).data;
  },
};
