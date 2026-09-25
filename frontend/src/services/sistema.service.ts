import { api } from './api';

export type LivelloBackup = 'OK' | 'ATTENZIONE' | 'ERRORE' | 'NON_CONFIGURATO';

export interface StatoSistema {
  database: { raggiungibile: boolean };
  backup: {
    livello: LivelloBackup;
    messaggio: string;
    ultimoTentativo: { quando: string; esito: string; errore: string | null } | null;
    ultimoRiuscito: { quando: string; file: string; dimensioneByte: number } | null;
    backupConservati: number | null;
    ora: string | null;
  };
  posta: { configurata: boolean };
  avviato: string;
  versione: string | null;
}

export const sistemaService = {
  async stato(): Promise<StatoSistema> {
    return (await api.get<StatoSistema>('/sistema/stato')).data;
  },
};
