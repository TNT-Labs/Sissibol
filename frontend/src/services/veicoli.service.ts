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

  async update(id: number, data: Partial<Veicolo>): Promise<Veicolo> {
    const response = await api.patch<Veicolo>(`/veicoli/${id}`, data);
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
