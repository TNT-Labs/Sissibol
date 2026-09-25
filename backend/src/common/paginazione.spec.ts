import { DIMENSIONE_MASSIMA_PAGINA, paginazioneSicura } from './paginazione';

describe('paginazioneSicura', () => {
  it('lascia invariati valori validi', () => {
    expect(paginazioneSicura(3, 50, 100)).toEqual({ page: 3, pageSize: 50 });
  });

  it('limita la dimensione della pagina', () => {
    expect(paginazioneSicura(1, 1_000_000, 100).pageSize).toBe(DIMENSIONE_MASSIMA_PAGINA);
  });

  it('valori assenti, non numerici o fuori intervallo diventano i predefiniti', () => {
    for (const [p, d] of [[undefined, undefined], [NaN, NaN], [0, 0], [-2, -5], [1.5, 2.5], ['abc', 'x']]) {
      expect(paginazioneSicura(p, d, 100)).toEqual({ page: 1, pageSize: 100 });
    }
  });
});
