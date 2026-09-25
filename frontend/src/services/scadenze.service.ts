import { api } from './api';
import type { Cliente, Scadenza, StatoScadenza } from '../types';

// Interfaccia per la risposta paginata
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface ScadenzeStats {
  daPagare: number;
  pagato: number;
  scaduto: number;
  totale: number;
  importoTotale: number;
}

/** Risultato della ricerca di scadenze da pagare (dati essenziali). */
export interface ScadenzaTrovata {
  id: number;
  dataScadenza: string;
  meseScadenza: number;
  annoScadenza: number;
  periodicita: string;
  importoPrevisto: string | null;
  stato: StatoScadenza;
  veicolo: {
    id: number;
    targa: string;
    cliente: Pick<Cliente, 'id' | 'tipoCliente' | 'ragioneSociale' | 'nome' | 'cognome'>;
  };
}

export const scadenzeService = {
  /**
   * Scadenze non pagate (da pagare o scadute) per targa o cliente: pochi
   * risultati, per scegliere quella a cui registrare un pagamento.
   */
  async cercaDaPagare(testo: string): Promise<ScadenzaTrovata[]> {
    const response = await api.get<ScadenzaTrovata[]>('/scadenze/cerca', {
      params: { q: testo || undefined, limite: 20 },
    });
    return response.data;
  },

  /**
   * Carica scadenze filtrate per mese/anno (ottimizzato per scadenziario)
   */
  async getByMeseAnno(meseScadenza: number, annoScadenza: number): Promise<Scadenza[]> {
    const response = await api.get<Scadenza[]>('/scadenze', {
      params: { meseScadenza, annoScadenza },
    });
    return response.data;
  },

  /**
   * Versione paginata per report e export di grandi dataset.
   * Previene memory overflow caricando i dati in chunk.
   */
  async getAllPaginated(options: {
    page?: number;
    pageSize?: number;
    stato?: StatoScadenza;
    idCliente?: number;
    annoFrom?: number;
    annoTo?: number;
  }): Promise<PaginatedResponse<Scadenza>> {
    const response = await api.get<PaginatedResponse<Scadenza>>('/scadenze/paginated', {
      params: options,
    });
    return response.data;
  },

  /**
   * Statistiche aggregate per scadenze (per dashboard).
   * Più efficiente di caricare tutti i dati.
   */
  async getStats(idCliente?: number): Promise<ScadenzeStats> {
    const response = await api.get<ScadenzeStats>('/scadenze/stats', {
      params: { idCliente },
    });
    return response.data;
  },

  async getInScadenza(giorni?: number): Promise<Scadenza[]> {
    const response = await api.get<Scadenza[]>('/scadenze/in-scadenza', {
      params: { giorni },
    });
    return response.data;
  },

  async getById(id: number): Promise<Scadenza> {
    const response = await api.get<Scadenza>(`/scadenze/${id}`);
    return response.data;
  },

  async create(data: Partial<Scadenza>): Promise<Scadenza> {
    const response = await api.post<Scadenza>('/scadenze', data);
    return response.data;
  },

  async update(id: number, data: Partial<Scadenza>): Promise<Scadenza> {
    const response = await api.patch<Scadenza>(`/scadenze/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/scadenze/${id}`);
  },

  async ricalcolaImporto(id: number): Promise<Scadenza> {
    const response = await api.post<Scadenza>(`/scadenze/${id}/ricalcola`);
    return response.data;
  },

  /**
   * Genera scadenze future per tutti i veicoli fino all'anno specificato.
   * Evita duplicati: non crea scadenze che esistono già.
   *
   * @param annoTarget - Anno fino al quale generare le scadenze (incluso)
   * @returns Statistiche sulla generazione
   */
  async generaScadenzeFuture(annoTarget: number): Promise<{
    veicoliProcessati: number;
    scadenzeCreate: number;
    scadenzeSaltate: number;
    /** Scadenze create senza importo perché il bollo non è calcolabile */
    scadenzeSenzaImporto: number;
    errori: string[];
  }> {
    const response = await api.post<{
      veicoliProcessati: number;
      scadenzeCreate: number;
      scadenzeSaltate: number;
      scadenzeSenzaImporto: number;
      errori: string[];
    }>('/scadenze/genera-future', { annoTarget });
    return response.data;
  },
};
