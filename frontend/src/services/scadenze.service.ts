import { api } from './api';
import type { Scadenza, StatoScadenza } from '../types';

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

export const scadenzeService = {
  async getAll(stato?: StatoScadenza, idCliente?: number): Promise<Scadenza[]> {
    const response = await api.get<Scadenza[]>('/scadenze', {
      params: { stato, idCliente },
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
   * Itera su tutte le pagine e chiama il callback per ogni chunk.
   * Utile per generare report senza caricare tutto in memoria.
   *
   * @param options - Opzioni di filtro
   * @param onChunk - Callback chiamata per ogni pagina di dati
   * @param pageSize - Dimensione della pagina (default: 500)
   */
  async iterateAll(
    options: { stato?: StatoScadenza; idCliente?: number; annoFrom?: number; annoTo?: number },
    onChunk: (scadenze: Scadenza[], progress: { current: number; total: number }) => Promise<void> | void,
    pageSize: number = 500,
  ): Promise<{ totalCount: number }> {
    let page = 1;
    let totalCount = 0;

    while (true) {
      const response = await this.getAllPaginated({ ...options, page, pageSize });
      totalCount = response.pagination.totalCount;

      if (response.data.length === 0) break;

      await onChunk(response.data, {
        current: Math.min(page * pageSize, totalCount),
        total: totalCount,
      });

      if (!response.pagination.hasNextPage) break;
      page++;
    }

    return { totalCount };
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
};
