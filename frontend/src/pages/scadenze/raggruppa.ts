import { TipoCliente, getClienteDisplayName } from '../../types';
import type { Cliente, Scadenza } from '../../types';

export interface ClienteConScadenze {
  cliente: Cliente;
  scadenze: Scadenza[];
  /** Veicoli distinti (un veicolo quadrimestrale può avere più scadenze). */
  veicoli: number;
}

const SENZA_CLIENTE = {
  id: -1,
  tipoCliente: TipoCliente.PERSONA_GIURIDICA,
  ragioneSociale: 'Cliente non associato',
} as Cliente;

/** Scadenze del mese raggruppate per cliente, in ordine alfabetico. */
export function raggruppaPerCliente(scadenze: Scadenza[]): ClienteConScadenze[] {
  const gruppi = new Map<number, ClienteConScadenze & { idVeicoli: Set<number> }>();
  for (const scadenza of scadenze) {
    const cliente = scadenza.veicolo?.cliente ?? SENZA_CLIENTE;
    let gruppo = gruppi.get(cliente.id);
    if (!gruppo) {
      gruppo = { cliente, scadenze: [], veicoli: 0, idVeicoli: new Set() };
      gruppi.set(cliente.id, gruppo);
    }
    gruppo.scadenze.push(scadenza);
    gruppo.idVeicoli.add(scadenza.idVeicolo);
    gruppo.veicoli = gruppo.idVeicoli.size;
  }
  return [...gruppi.values()]
    .map(({ cliente, scadenze: elenco, veicoli }) => ({
      cliente,
      veicoli,
      // Dentro il cliente, in ordine di targa.
      scadenze: elenco.sort((a, b) => (a.veicolo?.targa ?? '').localeCompare(b.veicolo?.targa ?? '')),
    }))
    .sort((a, b) => getClienteDisplayName(a.cliente).localeCompare(getClienteDisplayName(b.cliente), 'it'));
}
