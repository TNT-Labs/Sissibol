import React from 'react';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import type { StatoAvvisi } from '../../services/avvisi.service';
import { descriviInvio, formattaIstante } from './formato';

/** Come e quando partono gli avvisi, e l'esito dell'ultimo invio. */
export const StatoInvio: React.FC<{ stato: StatoAvvisi }> = ({ stato }) => {
  let icona = <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />;
  let stile = 'bg-green-50 border-green-200 text-green-900';
  let messaggio = `Invio automatico attivo: ogni giorno alle ${stato.orario} (${stato.fusoOrario}), al massimo ${stato.maxEmailPerEsecuzione} email per giro.`;

  if (!stato.smtpConfigurato) {
    icona = <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />;
    stile = 'bg-amber-50 border-amber-200 text-amber-900';
    messaggio =
      'Server di posta non configurato: gli avvisi maturano ma non possono essere inviati. Configurare SMTP_HOST e SMTP_FROM sul server.';
  } else if (!stato.invioAutomatico) {
    icona = <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" aria-hidden="true" />;
    stile = 'bg-blue-50 border-blue-200 text-blue-900';
    messaggio = `Invio manuale: gli avvisi partono solo con "Invia ora". Maturano ogni giorno alle ${stato.orario}; per inviarli automaticamente impostare AVVISI_INVIO_AUTOMATICO=true.`;
  }

  return (
    <div className={`flex gap-3 p-4 border rounded-lg ${stile}`}>
      {icona}
      <div className="text-sm min-w-0">
        <p>{messaggio}</p>
        {stato.ultimaEsecuzione && (
          <p className="mt-1 opacity-80">
            Ultimo invio: {formattaIstante(stato.ultimaEsecuzione.quando)} — {descriviInvio(stato.ultimaEsecuzione.esito)}
            {stato.ultimaEsecuzione.esito.interrotto && ` Interrotto: ${stato.ultimaEsecuzione.esito.interrotto}`}
          </p>
        )}
      </div>
    </div>
  );
};
