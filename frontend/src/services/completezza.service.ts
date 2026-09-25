import { api } from './api';

export interface CampoDaCompletare {
  campo: string;
  etichetta: string;
  doveTrovarlo: string | null;
  motivo: 'MANCANTE' | 'NON_VALIDO' | 'DA_RICLASSIFICARE';
  messaggio: string;
}

export interface ValutazioneVeicolo {
  idVeicolo: number;
  targa: string;
  idCliente: number;
  cliente: string;
  tipoVeicolo: string | null;
  periodicita: 'ANNUALE' | 'QUADRIMESTRALE';
  esito: 'CALCOLATO' | 'ESENTE' | 'NON_CALCOLABILE';
  importo: number | null;
  mancanti: CampoDaCompletare[];
  consigliati: CampoDaCompletare[];
  tariffario: string[];
  valori: Record<string, string | number | null>;
  scadenzeSenzaImporto: number;
}

export interface VoceConteggio {
  chiave: string;
  etichetta: string;
  doveTrovarlo: string | null;
  veicoli: number;
}

export interface RapportoCompletezza {
  anno: number;
  totale: number;
  calcolabili: number;
  nonCalcolabili: number;
  perCampo: VoceConteggio[];
  perConsigliato: VoceConteggio[];
  problemiTariffario: Array<{ messaggio: string; veicoli: number }>;
  scadenzeSenzaImporto: number;
  anniConTariffario: number[];
}

export type FiltroStato = 'DA_COMPLETARE' | 'CONSIGLIATI' | 'TUTTI';

export interface FiltriCompletezza {
  stato?: FiltroStato;
  campo?: string;
  cerca?: string;
  periodicita?: 'ANNUALE' | 'QUADRIMESTRALE';
  pagina?: number;
  perPagina?: number;
}

export interface ElencoCompletezza {
  rapporto: RapportoCompletezza;
  righe: ValutazioneVeicolo[];
  totaleRighe: number;
  pagina: number;
  pagine: number;
  perPagina: number;
}

/** Campi impostabili su più veicoli insieme (dominio chiuso). */
export type CampoMultiplo = 'tipoVeicolo' | 'classeAmbientale' | 'alimentazione' | 'regione' | 'tipoSospensione';

export const completezzaService = {
  async elenco(filtri: FiltriCompletezza): Promise<ElencoCompletezza> {
    const params = Object.fromEntries(Object.entries(filtri).filter(([, v]) => v !== undefined && v !== ''));
    return (await api.get<ElencoCompletezza>('/completezza', { params })).data;
  },

  async veicolo(id: number): Promise<ValutazioneVeicolo> {
    return (await api.get<ValutazioneVeicolo>(`/completezza/veicolo/${id}`)).data;
  },

  async imposta(
    idVeicoli: number[],
    campo: CampoMultiplo,
    valore: string,
  ): Promise<{ aggiornati: number; importiCompletati: number; nonTrovati: number[] }> {
    return (await api.post('/completezza/imposta', { idVeicoli, campo, valore })).data;
  },
};
