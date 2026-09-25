import { ORE_MASSIME_SENZA_BACKUP, valutaBackup } from './stato-backup';

const ADESSO = new Date('2026-10-01T10:00:00+02:00');
const ore = (n: number) => new Date(ADESSO.getTime() - n * 3_600_000).toISOString();

const stato = (o: Record<string, unknown>) =>
  JSON.stringify({
    esito: 'OK',
    quando: ore(8),
    errore: null,
    ultimoRiuscito: { quando: ore(8), file: 'sissibol-20261001-023000.dump', dimensioneByte: 1929187 },
    backupConservati: 14,
    ora: '02:30',
    ...o,
  });

describe('valutaBackup', () => {
  it('senza configurazione non segnala errori (ambiente di sviluppo)', () => {
    expect(valutaBackup(null, false, ADESSO).livello).toBe('NON_CONFIGURATO');
  });

  it('backup regolare', () => {
    const v = valutaBackup(stato({}), true, ADESSO);
    expect(v.livello).toBe('OK');
    expect(v.ultimoRiuscito).toEqual({
      quando: ore(8),
      file: 'sissibol-20261001-023000.dump',
      dimensioneByte: 1929187,
    });
    expect(v.backupConservati).toBe(14);
  });

  it('configurato ma senza stato: il servizio non è attivo', () => {
    expect(valutaBackup(null, true, ADESSO)).toMatchObject({ livello: 'ERRORE' });
  });

  it('stato illeggibile', () => {
    expect(valutaBackup('{non json', true, ADESSO).livello).toBe('ERRORE');
  });

  it('nessun backup riuscito finora', () => {
    const v = valutaBackup(stato({ esito: 'ERRORE', errore: 'connessione rifiutata', ultimoRiuscito: null }), true, ADESSO);
    expect(v.livello).toBe('ERRORE');
    expect(v.ultimoTentativo).toMatchObject({ esito: 'ERRORE', errore: 'connessione rifiutata' });
  });

  it(`ultimo backup riuscito oltre ${ORE_MASSIME_SENZA_BACKUP} ore fa: errore anche se l'ultimo tentativo è OK`, () => {
    const vecchio = { quando: ore(ORE_MASSIME_SENZA_BACKUP + 2), file: 'x.dump', dimensioneByte: 1 };
    const v = valutaBackup(stato({ ultimoRiuscito: vecchio }), true, ADESSO);
    expect(v.livello).toBe('ERRORE');
    expect(v.messaggio).toMatch(/da 32 ore/);
  });

  it('ultimo tentativo fallito ma backup valido recente: attenzione', () => {
    const v = valutaBackup(stato({ esito: 'ERRORE', errore: 'disco pieno', quando: ore(1) }), true, ADESSO);
    expect(v.livello).toBe('ATTENZIONE');
  });

  it('una data non valida non passa per recente', () => {
    const v = valutaBackup(stato({ ultimoRiuscito: { quando: 'ieri', file: 'x.dump' } }), true, ADESSO);
    expect(v.livello).toBe('ERRORE');
  });

  it('legge lo stato scritto da backup.sh', () => {
    // Formato reale prodotto dallo script (vedi scripts/backup/backup.sh).
    const reale =
      '{"esito":"OK","quando":"2026-10-01T02:30:05+02:00","errore":null,"ultimoRiuscito":{"file":"sissibol-20261001-023001.dump","dimensioneByte":1929187,"quando":"2026-10-01T02:30:04+02:00"},"backupConservati":3,"conservazione":{"giorni":14,"mesi":12},"ora":"02:30"}';
    expect(valutaBackup(reale, true, ADESSO).livello).toBe('OK');
  });
});
