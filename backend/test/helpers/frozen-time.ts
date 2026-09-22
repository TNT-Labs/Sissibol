/**
 * Congela l'orologio di sistema per la durata di una funzione.
 *
 * Serve al golden master: il motore di calcolo bollo usa `new Date()` per
 * determinare l'anzianità del veicolo (esenzioni storiche, esenzione elettrico
 * nei primi 5 anni). Senza congelare il tempo, gli importi attesi cambierebbero
 * da soli al passare dei giorni e il test diventerebbe instabile.
 *
 * Lo stesso helper è usato dal generatore dei fixture e dal test che li
 * verifica, così le due esecuzioni partono esattamente dallo stesso istante.
 */

/** Istante di riferimento del golden master. Cambiarlo richiede rigenerare i fixture. */
export const GOLDEN_REFERENCE_DATE = '2026-06-15T12:00:00.000Z';

export async function withFrozenTime<T>(
  isoDate: string,
  fn: () => Promise<T>,
): Promise<T> {
  const RealDate = global.Date;
  const frozen = new RealDate(isoDate).getTime();

  class FrozenDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(frozen);
      } else {
        // @ts-expect-error - inoltro trasparente degli overload nativi di Date
        super(...args);
      }
    }

    static now(): number {
      return frozen;
    }
  }

  global.Date = FrozenDate as unknown as DateConstructor;
  try {
    return await fn();
  } finally {
    global.Date = RealDate;
  }
}
