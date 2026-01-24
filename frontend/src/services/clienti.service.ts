import { api } from './api';
import { Cliente } from '../types';

export const clientiService = {
  async getAll(search?: string): Promise<Cliente[]> {
    const response = await api.get<Cliente[]>('/clienti', {
      params: { search },
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

  async delete(id: number): Promise<void> {
    await api.delete(`/clienti/${id}`);
  },
};
