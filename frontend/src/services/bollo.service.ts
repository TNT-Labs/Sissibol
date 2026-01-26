import api from './api';
import type { ConfigurazioneBollo, TariffaBollo, CalcoloBolloResult, Veicolo } from '../types';

export const bolloService = {
  /**
   * Calcola il bollo per un veicolo specifico
   */
  async calcolaBollo(
    idVeicolo: number,
    anno?: number,
    periodicita?: 'ANNUALE' | 'QUADRIMESTRALE'
  ): Promise<CalcoloBolloResult> {
    const params = new URLSearchParams();
    if (anno) params.append('anno', anno.toString());
    if (periodicita) params.append('periodicita', periodicita);

    const queryString = params.toString();
    const url = `/bollo/calcola/${idVeicolo}${queryString ? `?${queryString}` : ''}`;

    const response = await api.get(url);
    return response.data;
  },

  /**
   * Calcola il bollo per tutti i veicoli di un cliente
   */
  async calcolaBolloCliente(
    idCliente: number,
    anno?: number
  ): Promise<{ veicolo: Veicolo; calcolo: CalcoloBolloResult }[]> {
    const params = anno ? `?anno=${anno}` : '';
    const response = await api.get(`/bollo/cliente/${idCliente}${params}`);
    return response.data;
  },

  /**
   * Aggiorna gli importi di tutte le scadenze future di un veicolo
   */
  async aggiornaScadenze(idVeicolo: number): Promise<{ message: string; aggiornate: number }> {
    const response = await api.post(`/bollo/aggiorna-scadenze/${idVeicolo}`);
    return response.data;
  },

  // =====================================================
  // GESTIONE CONFIGURAZIONI
  // =====================================================

  /**
   * Ottieni tutte le configurazioni tariffe
   */
  async getConfigurazioni(): Promise<ConfigurazioneBollo[]> {
    const response = await api.get('/bollo/configurazioni');
    return response.data;
  },

  /**
   * Ottieni una configurazione specifica con tutte le tariffe
   */
  async getConfigurazione(id: number): Promise<ConfigurazioneBollo> {
    const response = await api.get(`/bollo/configurazioni/${id}`);
    return response.data;
  },

  /**
   * Crea una nuova configurazione
   */
  async createConfigurazione(data: {
    annoValidita: number;
    regione: string;
    scontoRid?: number;
    note?: string;
  }): Promise<ConfigurazioneBollo> {
    const response = await api.post('/bollo/configurazioni', data);
    return response.data;
  },

  /**
   * Duplica una configurazione per un nuovo anno
   */
  async duplicaConfigurazione(id: number, nuovoAnno: number): Promise<ConfigurazioneBollo> {
    const response = await api.post(`/bollo/configurazioni/${id}/duplica`, { nuovoAnno });
    return response.data;
  },

  /**
   * Ottieni le tariffe di una configurazione
   */
  async getTariffe(idConfigurazione: number): Promise<TariffaBollo[]> {
    const response = await api.get(`/bollo/configurazioni/${idConfigurazione}/tariffe`);
    return response.data;
  },

  /**
   * Aggiorna una tariffa
   */
  async updateTariffa(
    id: number,
    data: {
      importoUnitario?: number;
      importoFisso?: number;
      descrizione?: string;
    }
  ): Promise<TariffaBollo> {
    const response = await api.post(`/bollo/tariffe/${id}`, data);
    return response.data;
  },

  /**
   * Crea una nuova tariffa
   */
  async createTariffa(
    idConfigurazione: number,
    data: {
      tipoVeicolo: string;
      categoriaEuro?: string;
      unitaMisura: string;
      sogliaMin?: number;
      sogliaMax?: number;
      importoUnitario: number;
      importoFisso?: number;
      tipoSospensione?: string;
      periodicita?: string;
      descrizione?: string;
    }
  ): Promise<TariffaBollo> {
    const response = await api.post(`/bollo/configurazioni/${idConfigurazione}/tariffe`, data);
    return response.data;
  },
};
