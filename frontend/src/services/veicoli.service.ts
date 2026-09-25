import { api } from './api';
import type { Veicolo } from '../types';

export interface PaginatedVeicoli {
  data: Veicolo[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/** Dati inviabili: null svuota un campo in modifica. */
export type DatiVeicolo = { [K in keyof Veicolo]?: Veicolo[K] | null };

export const veicoliService = {
  async getAll(idCliente?: number, search?: string): Promise<Veicolo[]> {
    const response = await api.get<Veicolo[]>('/veicoli', {
      params: { idCliente, search },
    });
    return response.data;
  },

  /**
   * Lista paginata server-side.
   * attivo: true (default) = solo attivi, false = solo disattivati
   */
  async getAllPaginated(options: {
    page?: number;
    pageSize?: number;
    idCliente?: number;
    search?: string;
    attivo?: boolean;
  }): Promise<PaginatedVeicoli> {
    const response = await api.get<PaginatedVeicoli>('/veicoli/paginated', {
      params: options,
    });
    return response.data;
  },

  async getById(id: number): Promise<Veicolo> {
    const response = await api.get<Veicolo>(`/veicoli/${id}`);
    return response.data;
  },

  async create(data: Partial<Veicolo>): Promise<Veicolo> {
    const response = await api.post<Veicolo>('/veicoli', data);
    return response.data;
  },

  /**
   * null svuota un campo. La risposta indica quante scadenze senza importo lo
   * hanno ricevuto grazie ai dati completati.
   */
  async update(id: number, data: DatiVeicolo): Promise<Veicolo & { importiCompletati?: number }> {
    const response = await api.patch<Veicolo & { importiCompletati?: number }>(`/veicoli/${id}`, data);
    return response.data;
  },

  /**
   * Soft-delete: disattiva il veicolo (scadenze e pagamenti restano).
   * Con hard=true (solo ADMIN) elimina definitivamente.
   */
  async delete(id: number, hard: boolean = false): Promise<void> {
    await api.delete(`/veicoli/${id}`, { params: hard ? { hard: 'true' } : {} });
  },
};
