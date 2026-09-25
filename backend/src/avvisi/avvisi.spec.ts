import { componiAvviso, escapeHtml, formattaImporto, nomeCliente, VoceAvviso } from './composizione';
import {
  AvvisoDaValutare,
  classificaErroreInvio,
  eSecondoPerIlCliente,
  estraiRecapiti,
  MAX_TENTATIVI,
  MOTIVO_ASSORBITO,
  prossimoTentativo,
  valutaAvviso,
} from './regole-invio';
import { leggiConfigurazioneAvvisi } from './configurazione';
import { leggiOrario } from '../mail/fuso-orario';

const data = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('estraiRecapiti', () => {
  it('accetta un indirizzo singolo', () => {
    expect(estraiRecapiti('cliente@example.com')).toEqual(['cliente@example.com']);
  });

  it('separa più indirizzi e scarta duplicati e valori non validi', () => {
    expect(
      estraiRecapiti(' a@example.com; b@example.it,A@EXAMPLE.COM  telefono 02 1234 x@y'),
    ).toEqual(['a@example.com', 'b@example.it']);
  });

  it.each([null, undefined, '', '   ', 'nessuna', '@example.com', 'a@b'])(
    'non trova recapiti in %p',
    (valore) => {
      expect(estraiRecapiti(valore as string | null)).toEqual([]);
    },
  );
});

describe('valutaAvviso', () => {
  const OGGI = data('2026-06-15');

  function avviso(override: {
    tipo?: 'PRIMO' | 'SECONDO';
    stato?: string;
    dataScadenza?: Date;
    avvisi?: Array<{ tipo: string; esito: string }>;
    veicoloAttivo?: boolean;
    clienteAttivo?: boolean;
    avvisiEmail?: boolean;
    email?: string | null;
  } = {}): AvvisoDaValutare {
    return {
      tipo: override.tipo ?? 'PRIMO',
      scadenza: {
        stato: override.stato ?? 'DA_PAGARE',
        dataScadenza: override.dataScadenza ?? data('2026-06-30'),
        avvisi: override.avvisi ?? [{ tipo: override.tipo ?? 'PRIMO', esito: 'DA_INVIARE' }],
        veicolo: {
          attivo: override.veicoloAttivo ?? true,
          cliente: {
            attivo: override.clienteAttivo ?? true,
            avvisiEmail: override.avvisiEmail ?? true,
            email: 'email' in override ? override.email! : 'cliente@example.com',
          },
        },
      },
    };
  }

  it('invia un avviso valido ai recapiti del cliente', () => {
    expect(valutaAvviso(avviso(), OGGI)).toEqual({
      azione: 'INVIA',
      recapiti: ['cliente@example.com'],
    });
  });

  it('invia anche il giorno stesso della scadenza', () => {
    expect(valutaAvviso(avviso({ dataScadenza: OGGI }), OGGI).azione).toBe('INVIA');
  });

  it.each([
    [{ stato: 'PAGATO' }, 'Scadenza già pagata'],
    [{ stato: 'SCADUTO' }, 'Scadenza superata prima dell\'invio'],
    [{ dataScadenza: data('2026-06-14') }, 'Scadenza superata prima dell\'invio'],
    [{ veicoloAttivo: false }, 'Veicolo disattivato'],
    [{ clienteAttivo: false }, 'Cliente disattivato'],
    [{ avvisiEmail: false }, 'Il cliente non riceve avvisi via email'],
  ])('annulla l\'avviso se %p', (override, motivo) => {
    expect(valutaAvviso(avviso(override), OGGI)).toEqual({ azione: 'ANNULLA', motivo });
  });

  it('il secondo avviso attende il primo ancora in coda, e ne viene assorbito', () => {
    for (const esito of ['DA_INVIARE', 'IN_INVIO']) {
      const a = avviso({
        tipo: 'SECONDO',
        avvisi: [
          { tipo: 'PRIMO', esito },
          { tipo: 'SECONDO', esito: 'DA_INVIARE' },
        ],
      });
      expect(valutaAvviso(a, OGGI)).toEqual({ azione: 'ANNULLA', motivo: MOTIVO_ASSORBITO });
    }
  });

  it('il primo avviso in coda parte anche se il secondo è maturato', () => {
    const a = avviso({
      avvisi: [
        { tipo: 'PRIMO', esito: 'DA_INVIARE' },
        { tipo: 'SECONDO', esito: 'DA_INVIARE' },
      ],
    });
    expect(valutaAvviso(a, OGGI).azione).toBe('INVIA');
  });

  it('il secondo avviso parte se il primo è inviato, in errore o annullato', () => {
    for (const esito of ['INVIATO', 'ERRORE', 'ANNULLATO']) {
      const a = avviso({
        tipo: 'SECONDO',
        avvisi: [
          { tipo: 'PRIMO', esito },
          { tipo: 'SECONDO', esito: 'DA_INVIARE' },
        ],
      });
      expect(valutaAvviso(a, OGGI).azione).toBe('INVIA');
    }
  });

  it('non manda un primo avviso dopo che il secondo è già partito', () => {
    const a = avviso({
      avvisi: [
        { tipo: 'PRIMO', esito: 'DA_INVIARE' },
        { tipo: 'SECONDO', esito: 'INVIATO' },
      ],
    });
    expect(valutaAvviso(a, OGGI)).toEqual({
      azione: 'ANNULLA',
      motivo: 'Il cliente ha già ricevuto il secondo avviso',
    });
  });

  it('segnala un errore se il cliente non ha un recapito utilizzabile', () => {
    for (const email of [null, 'non è una email']) {
      expect(valutaAvviso(avviso({ email }), OGGI)).toEqual({
        azione: 'ERRORE',
        motivo: 'Recapito email del cliente mancante o non valido',
      });
    }
  });

  it('una scadenza pagata prevale su un recapito mancante', () => {
    // Nessun errore da sanare per un avviso che comunque non partirebbe.
    expect(valutaAvviso(avviso({ stato: 'PAGATO', email: null }), OGGI).azione).toBe('ANNULLA');
  });
});

describe('eSecondoPerIlCliente', () => {
  it('è un secondo avviso solo se il primo è stato davvero inviato', () => {
    expect(eSecondoPerIlCliente('SECONDO', [{ tipo: 'PRIMO', esito: 'INVIATO' }])).toBe(true);
    expect(eSecondoPerIlCliente('SECONDO', [{ tipo: 'PRIMO', esito: 'ERRORE' }])).toBe(false);
    expect(eSecondoPerIlCliente('SECONDO', [])).toBe(false);
    expect(eSecondoPerIlCliente('PRIMO', [{ tipo: 'PRIMO', esito: 'INVIATO' }])).toBe(false);
  });
});

describe('classificaErroreInvio', () => {
  it.each([
    [{ code: 'EAUTH', responseCode: 535, response: '535 Authentication failed' }, 'SISTEMICO'],
    [{ code: 'ECONNECTION', message: 'connect ECONNREFUSED' }, 'SISTEMICO'],
    [{ code: 'ETIMEDOUT', message: 'Connection timeout' }, 'SISTEMICO'],
    [{ code: 'EDNS', message: 'getaddrinfo ENOTFOUND' }, 'SISTEMICO'],
    [{ responseCode: 421, response: '421 Service not available' }, 'SISTEMICO'],
    [{ code: 'EENVELOPE', responseCode: 450, response: '450 Mailbox busy' }, 'TEMPORANEO'],
    [{ code: 'EENVELOPE', responseCode: 452, response: '452 Insufficient storage' }, 'TEMPORANEO'],
    [{ code: 'EENVELOPE', responseCode: 550, response: '550 5.1.1 User unknown' }, 'PERMANENTE'],
    [{ code: 'EMESSAGE', responseCode: 554, response: '554 Message rejected' }, 'PERMANENTE'],
    [{ code: 'EENVELOPE', message: 'No recipients defined' }, 'PERMANENTE'],
    [new Error('qualcosa di imprevisto'), 'TEMPORANEO'],
  ])('%p è %s', (errore, categoria) => {
    expect(classificaErroreInvio(errore).categoria).toBe(categoria);
  });

  it('conserva il codice e la risposta del server', () => {
    expect(classificaErroreInvio({ responseCode: 550, response: '550 User unknown' }).messaggio).toBe(
      '550 User unknown',
    );
    expect(classificaErroreInvio({ responseCode: 550, response: 'User unknown' }).messaggio).toBe(
      '550 User unknown',
    );
  });

  it('tronca i messaggi molto lunghi', () => {
    expect(classificaErroreInvio(new Error('x'.repeat(5000))).messaggio).toHaveLength(1000);
  });
});

describe('prossimoTentativo', () => {
  const ADESSO = new Date('2026-06-15T09:00:00.000Z');

  it('attende di più a ogni tentativo fallito', () => {
    expect(prossimoTentativo(1, ADESSO).toISOString()).toBe('2026-06-15T10:00:00.000Z');
    expect(prossimoTentativo(2, ADESSO).toISOString()).toBe('2026-06-15T15:00:00.000Z');
  });

  it('non va oltre l\'attesa più lunga', () => {
    expect(prossimoTentativo(10, ADESSO).toISOString()).toBe('2026-06-15T15:00:00.000Z');
  });

  it('prevede un\'attesa per ogni ritentativo ammesso', () => {
    // I tentativi falliti che lasciano l'avviso in coda sono MAX_TENTATIVI - 1.
    for (let t = 1; t < MAX_TENTATIVI; t++) {
      expect(prossimoTentativo(t, ADESSO).getTime()).toBeGreaterThan(ADESSO.getTime());
    }
  });
});

describe('componiAvviso', () => {
  const voce = (override: Partial<VoceAvviso> = {}): VoceAvviso => ({
    targa: 'AB123CD',
    dataScadenza: data('2026-06-30'),
    importoPrevisto: '258',
    tipo: 'PRIMO',
    ...override,
  });

  it('compone l\'avviso per un veicolo', () => {
    const email = componiAvviso({ nomeCliente: 'Trasporti Rossi Srl', voci: [voce()], firma: 'Studio Bianchi' });

    expect(email.oggetto).toBe('Scadenza bollo veicolo AB123CD il 30/06/2026');
    expect(email.testo).toContain('Gentile Trasporti Rossi Srl,');
    expect(email.testo).toContain('AB123CD: scadenza 30/06/2026, importo previsto 258,00');
    expect(email.testo).toMatch(/Cordiali saluti\nStudio Bianchi$/);
    expect(email.testo).not.toContain('secondo promemoria');
    expect(email.html).toContain('<td style="padding:6px 10px;border:1px solid #d1d5db;text-align:left">AB123CD</td>');
  });

  it('raggruppa più veicoli in un\'unica email, ordinati per scadenza', () => {
    const email = componiAvviso({
      nomeCliente: 'Cliente',
      voci: [
        voce({ targa: 'ZZ999ZZ', dataScadenza: data('2026-07-31') }),
        voce({ targa: 'BB222BB', dataScadenza: data('2026-06-30') }),
        voce({ targa: 'AA111AA', dataScadenza: data('2026-06-30') }),
      ],
      firma: '',
    });

    expect(email.oggetto).toBe('Scadenza bollo di 3 veicoli');
    const ordine = ['AA111AA', 'BB222BB', 'ZZ999ZZ'].map((t) => email.testo.indexOf(t));
    expect(ordine).toEqual([...ordine].sort((a, b) => a - b));
    expect(email.testo).toMatch(/Cordiali saluti$/);
  });

  it('dichiara l\'importo mancante invece di scrivere zero', () => {
    const email = componiAvviso({ nomeCliente: 'Cliente', voci: [voce({ importoPrevisto: null })], firma: '' });

    expect(email.testo).toContain('importo da definire');
    expect(email.testo).toContain('Gli importi da definire le saranno comunicati dallo studio.');
    expect(email.testo).not.toMatch(/0,00/);
  });

  it('segnala il secondo avviso nell\'oggetto e nel testo', () => {
    const email = componiAvviso({ nomeCliente: 'Cliente', voci: [voce({ tipo: 'SECONDO' })], firma: '' });

    expect(email.oggetto).toBe('Secondo avviso: scadenza bollo veicolo AB123CD il 30/06/2026');
    expect(email.testo).toContain('Questo è un secondo promemoria.');
  });

  it('tratta nomi e targhe come testo nell\'HTML', () => {
    const email = componiAvviso({
      nomeCliente: '<script>alert(1)</script> & C.',
      voci: [voce({ targa: '<b>X</b>' })],
      firma: 'Riga 1\n<i>Riga 2</i>',
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<b>X</b>');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; C.');
    expect(email.html).toContain('Riga 1<br>&lt;i&gt;Riga 2&lt;/i&gt;');
  });

  it('rifiuta un avviso senza veicoli', () => {
    expect(() => componiAvviso({ nomeCliente: 'X', voci: [], firma: '' })).toThrow();
  });

  it('formatta gli importi in euro, anche da Decimal', () => {
    // In italiano le migliaia si separano da cinque cifre in su (CLDR).
    expect(formattaImporto({ toString: () => '1234.5' })).toMatch(/^1234,50\s€$/);
    expect(formattaImporto(12345.5)).toMatch(/^12\.345,50\s€$/);
    expect(formattaImporto(null)).toBeNull();
    expect(formattaImporto('non numerico')).toBeNull();
  });

  it('escapeHtml neutralizza i caratteri speciali', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('nomeCliente preferisce la ragione sociale e ha un valore di riserva', () => {
    expect(nomeCliente({ ragioneSociale: 'ACME Srl', nome: 'Mario', cognome: 'Rossi' })).toBe('ACME Srl');
    expect(nomeCliente({ ragioneSociale: '  ', nome: 'Mario', cognome: 'Rossi' })).toBe('Mario Rossi');
    expect(nomeCliente({})).toBe('Cliente');
  });
});

describe('configurazione degli avvisi', () => {
  it('ha l\'invio automatico spento di default', () => {
    const c = leggiConfigurazioneAvvisi({});
    expect(c.invioAutomatico).toBe(false);
    expect(c.orario).toEqual({ ora: 9, minuti: 0 });
    expect(c.maxEmailPerEsecuzione).toBe(200);
    expect(c.firma).toBe('');
    expect(c.rispondiA).toBeUndefined();
  });

  it('legge le variabili d\'ambiente, con gli a capo nella firma', () => {
    const c = leggiConfigurazioneAvvisi({
      AVVISI_INVIO_AUTOMATICO: 'true',
      AVVISI_ORA: '8:30',
      AVVISI_MAX_EMAIL_PER_ESECUZIONE: '50',
      AVVISI_FIRMA: 'Studio Bianchi\\nTel. 02 1234',
      AVVISI_RISPONDI_A: ' studio@example.com ',
    });
    expect(c).toEqual({
      invioAutomatico: true,
      orario: { ora: 8, minuti: 30 },
      maxEmailPerEsecuzione: 50,
      firma: 'Studio Bianchi\nTel. 02 1234',
      rispondiA: 'studio@example.com',
    });
  });

  it('ignora valori non validi', () => {
    const c = leggiConfigurazioneAvvisi({
      AVVISI_INVIO_AUTOMATICO: 'si',
      AVVISI_ORA: '25:00',
      AVVISI_MAX_EMAIL_PER_ESECUZIONE: '-3',
    });
    expect(c.invioAutomatico).toBe(false);
    expect(c.orario).toEqual({ ora: 9, minuti: 0 });
    expect(c.maxEmailPerEsecuzione).toBe(200);
  });

  it('leggiOrario accetta solo HH:MM validi', () => {
    expect(leggiOrario('07:05', '09:00')).toEqual({ ora: 7, minuti: 5 });
    expect(leggiOrario('7', '09:00')).toEqual({ ora: 9, minuti: 0 });
    expect(leggiOrario('12:60', '09:00')).toEqual({ ora: 9, minuti: 0 });
  });
});
