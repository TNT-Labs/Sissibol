import { StatoScadenza } from '../../types';
import type { Scadenza } from '../../types';

export const ETICHETTA_STATO: Record<string, string> = {
  [StatoScadenza.DA_PAGARE]: 'Da pagare',
  [StatoScadenza.PAGATO]: 'Pagato',
  [StatoScadenza.SCADUTO]: 'Scaduto',
};

export const COLORE_STATO: Record<string, string> = {
  [StatoScadenza.DA_PAGARE]: 'bg-yellow-100 text-yellow-800',
  [StatoScadenza.PAGATO]: 'bg-green-100 text-green-800',
  [StatoScadenza.SCADUTO]: 'bg-red-100 text-red-800',
};

/** Da pagare o scaduta: si può ancora pagare. */
export const daRegolare = (s: Pick<Scadenza, 'stato'>) =>
  s.stato === StatoScadenza.DA_PAGARE || s.stato === StatoScadenza.SCADUTO;
