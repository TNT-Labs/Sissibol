import type { ConfigurazioneBollo, TariffaBollo } from '../../types';

const presente = (v: number | string | null | undefined): v is number | string => v !== null && v !== undefined && v !== '';

export interface GruppoTariffe {
  tipoVeicolo: string;
  tariffe: TariffaBollo[];
}

const CATEGORIA = new Intl.Collator('it', { numeric: true });
const soglia = (v: number | string | null | undefined) => (presente(v) ? Number(v) : -1);

/**
 * Nel gruppo: ordine del tariffario, poi categoria ("Euro 0", "Euro 1"...),
 * poi scaglione. Il server ordina per scaglione e mescolava le categorie.
 */
function confronta(a: TariffaBollo, b: TariffaBollo): number {
  return (
    (a.ordine ?? 0) - (b.ordine ?? 0) ||
    CATEGORIA.compare(a.categoriaEuro ?? '', b.categoriaEuro ?? '') ||
    CATEGORIA.compare(a.tipoSospensione ?? '', b.tipoSospensione ?? '') ||
    soglia(a.sogliaMin) - soglia(b.sogliaMin)
  );
}

/** Tariffe per tipo di veicolo; i tipi nell'ordine in cui li restituisce il server. */
export function raggruppaPerTipo(tariffe: TariffaBollo[]): GruppoTariffe[] {
  const gruppi = new Map<string, TariffaBollo[]>();
  for (const tariffa of tariffe) {
    const gruppo = gruppi.get(tariffa.tipoVeicolo);
    if (gruppo) gruppo.push(tariffa);
    else gruppi.set(tariffa.tipoVeicolo, [tariffa]);
  }
  return Array.from(gruppi, ([tipoVeicolo, elenco]) => ({ tipoVeicolo, tariffe: elenco.sort(confronta) }));
}

/**
 * Configurazione da mostrare all'apertura: quella attiva dell'anno in corso,
 * altrimenti la più recente (il server le ordina per anno decrescente).
 */
export function configurazionePredefinita(configurazioni: ConfigurazioneBollo[], anno: number) {
  return configurazioni.find((c) => c.annoValidita === anno && c.attivo) ?? configurazioni[0] ?? null;
}

/** Unità di misura come si leggono (quelle non previste restano come sono). */
export const ETICHETTA_UNITA: Record<string, string> = {
  KW: 'kW',
  CC: 'cc',
  KG_PORTATA: 'kg di portata',
  MASSA_RIMORCHIABILE: 'kg rimorchiabili',
  POSTI: 'posti',
  ASSI: 'assi',
  FISSO: 'Importo fisso',
};

export const etichettaUnita = (unita: string) => ETICHETTA_UNITA[unita] ?? unita;

const NUMERO = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

/** Scaglione di una tariffa ("53 – 74 kW", "da 100 kW", "3 assi"). */
export function formattaSoglia(tariffa: TariffaBollo): string {
  const unita = tariffa.unitaMisura && tariffa.unitaMisura !== 'FISSO' ? ` ${etichettaUnita(tariffa.unitaMisura)}` : '';
  const min = presente(tariffa.sogliaMin) ? NUMERO.format(Number(tariffa.sogliaMin)) : null;
  const max = presente(tariffa.sogliaMax) ? NUMERO.format(Number(tariffa.sogliaMax)) : null;
  // Gli assi degli autocarri hanno minimo e massimo uguali: "3 assi".
  if (min !== null && min === max) return `${min}${unita}`;
  if (min !== null && max !== null) return `${min} – ${max}${unita}`;
  if (min !== null) return `da ${min}${unita}`;
  if (max !== null) return `fino a ${max}${unita}`;
  return '—';
}

/**
 * Tariffe che valgono solo per l'importo fisso: quelle a importo fisso e gli
 * scaglioni (portata, assi) con l'unitario a zero. Il motore di calcolo usa
 * solo l'importo fisso, che quindi non può mancare.
 */
export function soloImportoFisso(tariffa: TariffaBollo): boolean {
  return tariffa.unitaMisura === 'FISSO' || (Number(tariffa.importoUnitario) === 0 && presente(tariffa.importoFisso));
}

export const ETICHETTA_PERIODICITA: Record<string, string> = {
  ANNUALE: 'Annuale',
  QUADRIMESTRALE: 'Quadrimestrale',
};

/**
 * Legge un importo scritto a mano: accetta la virgola italiana ("2,5823") e
 * al massimo `decimali` cifre decimali. null se il testo non è un importo
 * valido (prima un campo vuoto o errato diventava NaN e veniva inviato).
 */
export function leggiImporto(testo: string, decimali: number): number | null {
  const pulito = testo.trim().replace(',', '.');
  if (!new RegExp(`^\\d{1,6}(\\.\\d{1,${decimali}})?$`).test(pulito)) return null;
  return Number(pulito);
}

/** Importo dal server (stringa "2.5800") al campo di testo ("2,58"). */
export function importoPerCampo(valore: number | string | null | undefined): string {
  if (!presente(valore)) return '';
  return String(Number(valore)).replace('.', ',');
}
