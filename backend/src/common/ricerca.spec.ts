import { paroleDiRicerca } from './ricerca';

describe('paroleDiRicerca', () => {
  it('divide per spazi, ignora spazi ripetuti e ai lati', () => {
    expect(paroleDiRicerca('  Rossi   Mario ')).toEqual(['Rossi', 'Mario']);
  });

  it('testo vuoto o non stringa: nessuna parola', () => {
    expect(paroleDiRicerca('')).toEqual([]);
    expect(paroleDiRicerca('   ')).toEqual([]);
    expect(paroleDiRicerca(undefined)).toEqual([]);
    expect(paroleDiRicerca(['a', 'b'])).toEqual([]);
  });

  it('al massimo 5 parole e 100 caratteri', () => {
    expect(paroleDiRicerca('a b c d e f g')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(paroleDiRicerca('x'.repeat(150))[0]).toHaveLength(100);
  });
});
