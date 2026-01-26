import { api } from './api';
import type { Scadenza, StatoScadenza } from '../types';

export const scadenzeService = {
  async getAll(stato?: StatoScadenza, idCliente?: number): Promise<Scadenza[]> {
    const response = await api.get<Scadenza[]>('/scadenze', {
      params: { stato, idCliente },
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
