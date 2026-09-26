import type { AvvisoInElenco, EsitoInvio } from '../../services/avvisi.service';

/** Date delle colonne DATE: arrivano a mezzanotte UTC, vanno lette in UTC. */
export const formattaGiorno = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('it-IT', { timeZone: 'UTC' }) : '-';

export const formattaIstante = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

export const nomeCliente = (c: AvvisoInElenco['scadenza']['veicolo']['cliente']) =>
  c.ragioneSociale?.trim() || [c.cognome, c.nome].filter(Boolean).join(' ') || 'Cliente';

export const conta = (n: number, singolare: string, plurale: string) => `${n} ${n === 1 ? singolare : plurale}`;

/** Riassunto leggibile di un invio. */
export function descriviInvio(esito: EsitoInvio): string {
  if (esito.smtpNonConfigurato) return 'Server di posta non configurato.';
  if (esito.giaInCorso) return 'Un invio è già in corso: riprovare fra qualche minuto.';
  const parti = [
    `${conta(esito.emailInviate, 'email inviata', 'email inviate')} (${conta(esito.avvisiInviati, 'avviso', 'avvisi')})`,
  ];
  if (esito.annullati) parti.push(conta(esito.annullati, 'annullato', 'annullati'));
  if (esito.errori) parti.push(`${esito.errori} in errore`);
  if (esito.daRitentare) parti.push(`${esito.daRitentare} da ritentare`);
  if (esito.recuperatiIncerti) parti.push(`${esito.recuperatiIncerti} con esito incerto`);
  if (esito.clientiRimandati) parti.push(`${conta(esito.clientiRimandati, 'cliente', 'clienti')} al prossimo giro`);
  return parti.join(', ') + '.';
}
