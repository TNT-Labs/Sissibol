import { ScadenzeService } from './scadenze.service';

/**
 * Unit test sulla logica date/scadenze (senza database).
 * PrismaService e BolloService sono mock vuoti: qui si testano solo
 * i metodi puri di calcolo.
 */
describe('ScadenzeService - logica date', () => {
  let service: ScadenzeService;

  beforeEach(() => {
    service = new ScadenzeService({} as any, {} as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getDataScadenzaEffettiva', () => {
    it('restituisce l\'ultimo giorno del mese', () => {
      const data = service.getDataScadenzaEffettiva(2026, 1);
      expect(data.getUTCFullYear()).toBe(2026);
      expect(data.getUTCMonth()).toBe(0);
      expect(data.getUTCDate()).toBe(31);
    });

    it('gestisce febbraio negli anni bisestili', () => {
      expect(service.getDataScadenzaEffettiva(2024, 2).getUTCDate()).toBe(29);
      expect(service.getDataScadenzaEffettiva(2025, 2).getUTCDate()).toBe(28);
    });

    it('gestisce i mesi da 30 giorni', () => {
      expect(service.getDataScadenzaEffettiva(2026, 4).getUTCDate()).toBe(30);
      expect(service.getDataScadenzaEffettiva(2026, 11).getUTCDate()).toBe(30);
    });
  });

  describe('isScadenzaImminente', () => {
    it('è imminente se cade entro i giorni di anticipo', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-03-10T12:00:00Z'));
      // Scadenza marzo 2026 → 31/03/2026, tra 21 giorni
      expect(
        service.isScadenzaImminente(
          { annoScadenza: 2026, meseScadenza: 3, periodicita: 'ANNUALE' },
          30,
        ),
      ).toBe(true);
    });

    it('non è imminente se già passata', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00Z'));
      expect(
        service.isScadenzaImminente(
          { annoScadenza: 2026, meseScadenza: 3, periodicita: 'ANNUALE' },
          30,
        ),
      ).toBe(false);
    });

    it('non è imminente se oltre la finestra di anticipo', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T12:00:00Z'));
      expect(
        service.isScadenzaImminente(
          { annoScadenza: 2026, meseScadenza: 6, periodicita: 'ANNUALE' },
          30,
        ),
      ).toBe(false);
    });

    it('gestisce il cambio anno (dicembre → gennaio)', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-12-20T12:00:00Z'));
      expect(
        service.isScadenzaImminente(
          { annoScadenza: 2027, meseScadenza: 1, periodicita: 'ANNUALE' },
          60,
        ),
      ).toBe(true);
    });
  });

  describe('getGiorniAllaScadenza', () => {
    it('conta i giorni rimanenti', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-03-01T00:00:00Z'));
      expect(
        service.getGiorniAllaScadenza({
          annoScadenza: 2026,
          meseScadenza: 3,
          periodicita: 'ANNUALE',
        }),
      ).toBe(30); // 1 → 31 marzo
    });

    it('è negativo per scadenze passate', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-15T00:00:00Z'));
      expect(
        service.getGiorniAllaScadenza({
          annoScadenza: 2026,
          meseScadenza: 3,
          periodicita: 'ANNUALE',
        }),
      ).toBeLessThan(0);
    });
  });

  describe('validaMeseScadenza', () => {
    it('accetta mesi 1-12', () => {
      expect(service.validaMeseScadenza(1, 'ANNUALE').valido).toBe(true);
      expect(service.validaMeseScadenza(12, 'QUADRIMESTRALE').valido).toBe(true);
    });

    it('rifiuta mesi fuori range', () => {
      expect(service.validaMeseScadenza(0, 'ANNUALE').valido).toBe(false);
      expect(service.validaMeseScadenza(13, 'ANNUALE').valido).toBe(false);
    });
  });

  describe('calcolaScadenzeDaCreare (quadrimestrale)', () => {
    it('genera 3 scadenze/anno ogni 4 mesi dal mese di immatricolazione', () => {
      // Immatricolazione marzo → marzo, luglio, novembre
      const scadenze = (service as any).calcolaScadenzeDaCreare(
        1, // idVeicolo
        3, // mese immatricolazione
        'QUADRIMESTRALE',
        2026, // anno corrente
        1, // mese corrente (gennaio: nessuna scadenza saltata)
        2026, // anno target
      );
      expect(scadenze.map((s: any) => s.meseScadenza)).toEqual([3, 7, 11]);
    });

    it('gestisce il wrap oltre dicembre', () => {
      // Immatricolazione novembre → novembre, marzo, luglio
      const scadenze = (service as any).calcolaScadenzeDaCreare(
        1,
        11,
        'QUADRIMESTRALE',
        2026,
        1,
        2026,
      );
      expect(scadenze.map((s: any) => s.meseScadenza).sort((a: number, b: number) => a - b))
        .toEqual([3, 7, 11]);
    });

    it('salta le scadenze già passate nell\'anno corrente', () => {
      const scadenze = (service as any).calcolaScadenzeDaCreare(
        1,
        3, // immatricolazione marzo
        'ANNUALE',
        2026,
        6, // mese corrente: giugno (marzo già passato)
        2027,
      );
      // Solo la scadenza 2027, quella 2026 è già passata
      expect(scadenze).toEqual([{ meseScadenza: 3, annoScadenza: 2027 }]);
    });
  });
});
