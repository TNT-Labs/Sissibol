import { api } from './api';
import { Veicolo } from '../types';

export const veicoliService = {
  async getAll(idCliente?: number): Promise<Veicolo[]> {
    const response = await api.get<Veicolo[]>('/veicoli', {
      params: { idCliente },
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

  async delete(id: number): Promise<void> {
    await api.delete(`/veicoli/${id}`);
  },
};
