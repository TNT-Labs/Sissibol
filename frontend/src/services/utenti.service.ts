import { api } from './api';
import type { Utente, Ruolo } from '../types';

export interface CreateUtenteRequest {
  email: string;
  password: string;
  ruolo: Ruolo;
}

export interface UpdateUtenteRequest {
  email?: string;
  password?: string;
  ruolo?: Ruolo;
}

export const utentiService = {
  async getAll(): Promise<Utente[]> {
    const response = await api.get<Utente[]>('/utenti');
    return response.data;
  },

  async getById(id: number): Promise<Utente> {
    const response = await api.get<Utente>(`/utenti/${id}`);
    return response.data;
  },

  async create(data: CreateUtenteRequest): Promise<Utente> {
    const response = await api.post<Utente>('/utenti', data);
    return response.data;
  },

  async update(id: number, data: UpdateUtenteRequest): Promise<Utente> {
    const response = await api.patch<Utente>(`/utenti/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/utenti/${id}`);
  },
};
