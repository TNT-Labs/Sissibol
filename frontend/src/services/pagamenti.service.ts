import { api } from './api';
import type { Pagamento } from '../types';

// Interfaccia per la risposta paginata
export interface PaginatedPagamentiResponse {
  data: Pagamento[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  summary: {
    importoTotale: number;
  };
}

export const pagamentiService = {
  async getAll(idScadenza?: number): Promise<Pagamento[]> {
    const response = await api.get<Pagamento[]>('/pagamenti', {
      params: { idScadenza },
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
    idScadenza?: number;
    dateFrom?: string;
    dateTo?: string;
    idCliente?: number;
  }): Promise<PaginatedPagamentiResponse> {
    const response = await api.get<PaginatedPagamentiResponse>('/pagamenti/paginated', {
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
    options: { dateFrom?: string; dateTo?: string; idCliente?: number },
    onChunk: (pagamenti: Pagamento[], progress: { current: number; total: number }) => Promise<void> | void,
    pageSize: number = 500,
  ): Promise<{ totalCount: number; importoTotale: number }> {
    let page = 1;
    let totalCount = 0;
    let importoTotale = 0;

    while (true) {
      const response = await this.getAllPaginated({ ...options, page, pageSize });
      totalCount = response.pagination.totalCount;
      importoTotale = response.summary.importoTotale;

      if (response.data.length === 0) break;

      await onChunk(response.data, {
        current: Math.min(page * pageSize, totalCount),
        total: totalCount,
      });

      if (!response.pagination.hasNextPage) break;
      page++;
    }

    return { totalCount, importoTotale };
  },

  async getById(id: number): Promise<Pagamento> {
    const response = await api.get<Pagamento>(`/pagamenti/${id}`);
    return response.data;
  },

  async create(data: Partial<Pagamento>, ricevuta?: File): Promise<Pagamento> {
    const formData = new FormData();

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        formData.append(key, value.toString());
      }
    });

    if (ricevuta) {
      formData.append('ricevuta', ricevuta);
    }

    const response = await api.post<Pagamento>('/pagamenti', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async update(id: number, data: Partial<Pagamento>): Promise<Pagamento> {
    const response = await api.patch<Pagamento>(`/pagamenti/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/pagamenti/${id}`);
  },

  /**
   * Scarica la ricevuta di un pagamento come Blob (endpoint autenticato).
   */
  async downloadRicevuta(id: number): Promise<Blob> {
    const response = await api.get(`/pagamenti/${id}/ricevuta`, {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Crea pagamenti multipli per tutte le scadenze di un cliente in un mese/anno.
   * Segna come pagati tutti i bolli del cliente per il periodo selezionato.
   */
  async createMultiplo(params: {
    idCliente: number;
    meseScadenza: number;
    annoScadenza: number;
    dataPagamento: string;
    metodoPagamento?: string;
  }): Promise<{ pagamentiCreati: number; errori: string[]; message: string }> {
    const response = await api.post('/pagamenti/multiplo', params);
    return response.data;
  },
};
