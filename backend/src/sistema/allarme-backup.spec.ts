import { decidiAvviso, ORE_FRA_PROMEMORIA } from './allarme-backup';

const ADESSO = new Date('2026-10-02T10:00:00Z');
const oreFa = (ore: number) => new Date(ADESSO.getTime() - ore * 3_600_000);

describe('decidiAvviso', () => {
  it('nulla da fare se tutto è regolare o i backup non sono configurati', () => {
    expect(decidiAvviso({ livello: 'OK' }, null, ADESSO)).toEqual({ avviso: null, dopo: null });
    expect(decidiAvviso({ livello: 'NON_CONFIGURATO' }, null, ADESSO)).toEqual({ avviso: null, dopo: null });
  });

  it('al primo problema un allarme', () => {
    expect(decidiAvviso({ livello: 'ERRORE' }, null, ADESSO)).toEqual({
      avviso: 'ALLARME',
      dopo: { livello: 'ERRORE', inviatoIl: ADESSO },
    });
    expect(decidiAvviso({ livello: 'ATTENZIONE' }, null, ADESSO).avviso).toBe('ALLARME');
  });

  it('se il problema continua, un promemoria solo dopo 24 ore', () => {
    const recente = { livello: 'ERRORE' as const, inviatoIl: oreFa(3) };
    expect(decidiAvviso({ livello: 'ERRORE' }, recente, ADESSO)).toEqual({ avviso: null, dopo: recente });

    const vecchio = { livello: 'ERRORE' as const, inviatoIl: oreFa(ORE_FRA_PROMEMORIA) };
    expect(decidiAvviso({ livello: 'ERRORE' }, vecchio, ADESSO)).toEqual({
      avviso: 'PROMEMORIA',
      dopo: { livello: 'ERRORE', inviatoIl: ADESSO },
    });
  });

  it('un peggioramento da attenzione a errore riavvisa subito', () => {
    const attenzione = { livello: 'ATTENZIONE' as const, inviatoIl: oreFa(1) };
    expect(decidiAvviso({ livello: 'ERRORE' }, attenzione, ADESSO).avviso).toBe('ALLARME');
  });

  it('un miglioramento non avvisa ma viene ricordato, così un nuovo peggioramento riavvisa', () => {
    const errore = { livello: 'ERRORE' as const, inviatoIl: oreFa(2) };
    const d = decidiAvviso({ livello: 'ATTENZIONE' }, errore, ADESSO);
    expect(d).toEqual({ avviso: null, dopo: { livello: 'ATTENZIONE', inviatoIl: errore.inviatoIl } });
    expect(decidiAvviso({ livello: 'ERRORE' }, d.dopo, ADESSO).avviso).toBe('ALLARME');
  });

  it('quando i backup tornano regolari, un messaggio di ripristino', () => {
    expect(decidiAvviso({ livello: 'OK' }, { livello: 'ERRORE', inviatoIl: oreFa(5) }, ADESSO)).toEqual({
      avviso: 'RIPRISTINO',
      dopo: null,
    });
  });
});
