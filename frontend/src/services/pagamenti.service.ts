import { api } from './api';
import { Pagamento } from '../types';

export const pagamentiService = {
  async getAll(idScadenza?: number): Promise<Pagamento[]> {
    const response = await api.get<Pagamento[]>('/pagamenti', {
      params: { idScadenza },
    });
    return response.data;
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
};
