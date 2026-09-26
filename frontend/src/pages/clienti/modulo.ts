import { TipoCliente } from '../../types';
import type { Cliente } from '../../types';
import type { DatiCliente } from '../../services/clienti.service';

export interface ModuloCliente {
  tipoCliente: TipoCliente;
  ragioneSociale: string;
  partitaIva: string;
  nome: string;
  cognome: string;
  codiceFiscale: string;
  indirizzo: string;
  email: string;
  telefono: string;
  note: string;
  attivo: boolean;
  avvisiEmail: boolean;
}

export type ErroriCliente = Partial<Record<keyof ModuloCliente, string>>;

export const MODULO_VUOTO: ModuloCliente = {
  tipoCliente: TipoCliente.PERSONA_GIURIDICA,
  ragioneSociale: '',
  partitaIva: '',
  nome: '',
  cognome: '',
  codiceFiscale: '',
  indirizzo: '',
  email: '',
  telefono: '',
  note: '',
  attivo: true,
  avvisiEmail: true,
};

export function daCliente(c: Cliente): ModuloCliente {
  return {
    tipoCliente: c.tipoCliente,
    ragioneSociale: c.ragioneSociale ?? '',
    partitaIva: c.partitaIva ?? '',
    nome: c.nome ?? '',
    cognome: c.cognome ?? '',
    codiceFiscale: c.codiceFiscale ?? '',
    indirizzo: c.indirizzo ?? '',
    email: c.email ?? '',
    telefono: c.telefono ?? '',
    note: c.note ?? '',
    attivo: c.attivo ?? true,
    avvisiEmail: c.avvisiEmail ?? true,
  };
}

// Stessa regola del server (class-validator IsEmail), in forma semplice:
// basta a segnalare gli errori di battitura prima dell'invio.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Dati da inviare, oppure gli errori da mostrare sotto i campi.
 * Le stringhe vuote non si inviano (il server valida anche i campi vuoti):
 * in creazione si omettono, in modifica si inviano come null per svuotare.
 * I campi dell'altro tipo di cliente restano come sono.
 */
export function versoApi(modulo: ModuloCliente, modifica: boolean): { dati: DatiCliente } | { errori: ErroriCliente } {
  const errori: ErroriCliente = {};
  const pf = modulo.tipoCliente === TipoCliente.PERSONA_FISICA;
  const t = (v: string) => v.trim();
  if (pf) {
    if (!t(modulo.cognome)) errori.cognome = 'Inserisci il cognome';
    if (!t(modulo.nome)) errori.nome = 'Inserisci il nome';
  } else if (!t(modulo.ragioneSociale)) {
    errori.ragioneSociale = 'Inserisci la ragione sociale';
  }
  if (t(modulo.email) && !EMAIL.test(t(modulo.email))) errori.email = 'Email non valida';
  if (Object.keys(errori).length > 0) return { errori };

  const vuoto = modifica ? null : undefined;
  const campo = (v: string) => t(v) || vuoto;
  return {
    dati: {
      tipoCliente: modulo.tipoCliente,
      attivo: modulo.attivo,
      avvisiEmail: modulo.avvisiEmail,
      ...(pf
        ? { nome: t(modulo.nome), cognome: t(modulo.cognome), codiceFiscale: campo(modulo.codiceFiscale.toUpperCase()) }
        : { ragioneSociale: t(modulo.ragioneSociale), partitaIva: campo(modulo.partitaIva) }),
      indirizzo: campo(modulo.indirizzo),
      email: campo(modulo.email),
      telefono: campo(modulo.telefono),
      note: campo(modulo.note),
    },
  };
}
