import { api } from './api';
import type { Cliente } from '../types';

export interface PaginatedClienti {
  data: Cliente[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export const clientiService = {
  async getAll(search?: string): Promise<Cliente[]> {
    const response = await api.get<Cliente[]>('/clienti', {
      params: { search },
    });
    return response.data;
  },

  /**
   * Lista paginata server-side con filtro per stato attivo.
   * attivo: true = solo attivi, false = solo disattivati, undefined = tutti
   */
  async getAllPaginated(options: {
    page?: number;
    pageSize?: number;
    search?: string;
    attivo?: boolean;
  }): Promise<PaginatedClienti> {
    const response = await api.get<PaginatedClienti>('/clienti/paginated', {
      params: options,
    });
    return response.data;
  },

  async getById(id: number): Promise<Cliente> {
    const response = await api.get<Cliente>(`/clienti/${id}`);
    return response.data;
  },

  async create(data: Partial<Cliente>): Promise<Cliente> {
    const response = await api.post<Cliente>('/clienti', data);
    return response.data;
  },

  async update(id: number, data: Partial<Cliente>): Promise<Cliente> {
    const response = await api.patch<Cliente>(`/clienti/${id}`, data);
    return response.data;
  },

  /**
   * Soft-delete: disattiva il cliente (i dati storici restano).
   * Con hard=true (solo ADMIN) elimina definitivamente cliente,
   * veicoli, scadenze e pagamenti collegati.
   */
  async delete(id: number, hard: boolean = false): Promise<void> {
    await api.delete(`/clienti/${id}`, { params: hard ? { hard: 'true' } : {} });
  },
};
