import { leggiOrario } from '../mail/fuso-orario';

export interface ConfigurazioneAvvisi {
  /** Se false, gli avvisi si inviano solo su comando di un amministratore */
  invioAutomatico: boolean;
  /** Ora del giro giornaliero di maturazione (e invio, se automatico) */
  orario: { ora: number; minuti: number };
  /** Email massime per esecuzione: protegge dai limiti del server di posta */
  maxEmailPerEsecuzione: number;
  firma: string;
  rispondiA?: string;
}

/**
 * Configurazione degli avvisi dalle variabili d'ambiente.
 *
 * L'invio automatico è spento di default, anche con il server di posta
 * configurato: attivarlo significa scrivere ai clienti dello studio, e deve
 * essere una scelta esplicita (AVVISI_INVIO_AUTOMATICO=true), non l'effetto
 * collaterale di aver configurato SMTP per il riepilogo interno.
 */
export function leggiConfigurazioneAvvisi(env: NodeJS.ProcessEnv = process.env): ConfigurazioneAvvisi {
  const max = parseInt(env.AVVISI_MAX_EMAIL_PER_ESECUZIONE || '', 10);
  return {
    invioAutomatico: env.AVVISI_INVIO_AUTOMATICO === 'true',
    orario: leggiOrario(env.AVVISI_ORA, '09:00'),
    maxEmailPerEsecuzione: Number.isFinite(max) && max > 0 ? Math.min(max, 2000) : 200,
    // Nelle variabili d'ambiente gli a capo si scrivono come \n.
    firma: (env.AVVISI_FIRMA || '').replace(/\\n/g, '\n').trim(),
    rispondiA: env.AVVISI_RISPONDI_A?.trim() || undefined,
  };
}
