import { NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { BolloService } from './bollo.service';

/**
 * Test dell'adattatore fra database e motore di calcolo.
 *
 * Le regole di calcolo sono verificate in `motore/motore.spec.ts` e dal
 * golden master; qui si verifica ciò che resta al servizio: selezione del
 * tariffario, conversione dei dati e protezione degli importi esistenti.
 */

const CONFIG_LOMBARDIA = {
  id: 7,
  annoValidita: 2026,
  regione: 'Lombardia',
  scontoRid: new Decimal(15),
  attivo: true,
  tariffe: [
    {
      id: 1,
      tipoVeicolo: 'Autovettura',
      categoriaEuro: 'Euro 4-5-6',
      unitaMisura: 'KW',
      sogliaMin: new Decimal(0),
      sogliaMax: null,
      importoUnitario: new Decimal('2.58'),
      importoFisso: null,
      tipoSospensione: null,
      periodicita: 'ANNUALE',
      descrizione: 'Autovetture Euro 4-5-6',
    },
  ],
  esenzioni: [],
};

const VEICOLO = {
  id: 1,
  targa: 'AB123CD',
  tipoVeicolo: 'Autovettura',
  classeAmbientale: 'Euro 6',
  regione: 'Lombardia',
  alimentazione: 'Benzina',
  potenzaKw: new Decimal(85),
  cilindrata: null,
  portataKg: null,
  pesoComplessivoKg: null,
  numeroAssi: null,
  tipoSospensione: null,
  numeroPosti: null,
  massaRimorchiabileKg: null,
  dataImmatricolazione: new Date('2020-03-10T00:00:00Z'),
};

function crea(opzioni: {
  veicolo?: Record<string, unknown> | null;
  configurazioni?: Array<Record<string, unknown> | null>;
  scadenze?: Array<Record<string, unknown>>;
}) {
  const configurazioni = [...(opzioni.configurazioni ?? [CONFIG_LOMBARDIA])];
  const prisma = {
    veicolo: {
      findUnique: jest.fn().mockResolvedValue(opzioni.veicolo === undefined ? VEICOLO : opzioni.veicolo),
    },
    configurazioneBollo: {
      findFirst: jest.fn().mockImplementation(() => Promise.resolve(configurazioni.shift() ?? null)),
    },
    scadenza: {
      findMany: jest.fn().mockResolvedValue(opzioni.scadenze ?? []),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const audit = { registra: jest.fn().mockResolvedValue(undefined) };
  return { service: new BolloService(prisma as never, audit as never), prisma, audit };
}

describe('BolloService - selezione del tariffario', () => {
  it('solleva un\'eccezione solo per un veicolo inesistente', async () => {
    const { service } = crea({ veicolo: null });
    await expect(service.calcolaBollo(99, 2026)).rejects.toThrow(NotFoundException);
  });

  it('senza regione non calcola e non assume la Lombardia', async () => {
    const { service, prisma } = crea({ veicolo: { ...VEICOLO, regione: null } });

    const r = await service.calcolaBollo(1, 2026);

    expect(r.esito).toBe('NON_CALCOLABILE');
    expect(r.motivi).toEqual([expect.objectContaining({ codice: 'DATO_MANCANTE', campo: 'regione' })]);
    expect(prisma.configurazioneBollo.findFirst).not.toHaveBeenCalled();
  });

  it('senza tariffario per la regione né DEFAULT restituisce un esito, non un\'eccezione', async () => {
    const { service, prisma } = crea({ configurazioni: [null, null] });

    const r = await service.calcolaBollo(1, 2026);

    expect(r.esito).toBe('NON_CALCOLABILE');
    expect(r.motivi[0].codice).toBe('TARIFFARIO_ASSENTE');
    // Ha tentato la regione del veicolo e poi il DEFAULT.
    expect(prisma.configurazioneBollo.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.configurazioneBollo.findFirst.mock.calls[1][0].where.regione).toBe('DEFAULT');
  });

  it('dichiara il tariffario DEFAULT quando è quello applicato', async () => {
    const { service } = crea({
      configurazioni: [null, { ...CONFIG_LOMBARDIA, id: 9, regione: 'DEFAULT' }],
    });

    const r = await service.calcolaBollo(1, 2026);

    expect(r.esito).toBe('CALCOLATO');
    expect(r.idConfigurazione).toBe(9);
    expect(r.regioneConfigurazione).toBe('DEFAULT');
  });

  it('riusa il tariffario in cache nei calcoli ripetuti', async () => {
    const { service, prisma } = crea({ configurazioni: [CONFIG_LOMBARDIA] });
    const cache = new Map();

    await service.calcolaBollo(1, 2026, 'ANNUALE', cache);
    await service.calcolaBollo(1, 2026, 'ANNUALE', cache);

    expect(prisma.configurazioneBollo.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe('BolloService - forma del risultato', () => {
  it('converte il risultato del motore nei numeri attesi dall\'API', async () => {
    const { service } = crea({});

    const r = await service.calcolaBollo(1, 2026);

    expect(r.esito).toBe('CALCOLATO');
    expect(r.importoBase).toBe(219.3);
    expect(r.importoRidotto).toBe(186.41);
    expect(r.scontoRid).toBe(15);
    expect(r.tariffeApplicate[0]).toEqual(
      expect.objectContaining({ importo: 219.3, unitaMisura: 'KW', valore: 85 }),
    );
    expect(r.versioneMotore).toMatch(/^2\./);
  });

  it('per un calcolo impossibile restituisce importo null, mai zero', async () => {
    const { service } = crea({ veicolo: { ...VEICOLO, potenzaKw: null } });

    const r = await service.calcolaBollo(1, 2026);

    expect(r.importoBase).toBeNull();
    expect(r.importoRidotto).toBeNull();
    expect(r.dettaglioCalcolo).toContain('Calcolo non possibile');
    expect(r.dettaglioCalcolo).toContain('potenza (KW)');
  });
});

describe('BolloService - aggiornamento degli importi delle scadenze', () => {
  const SCADENZA = {
    id: 50,
    annoScadenza: 2026,
    periodicita: 'ANNUALE',
    importoPrevisto: new Decimal('233.10'),
  };

  it('aggiorna l\'importo e lo registra nel registro delle modifiche', async () => {
    const { service, prisma, audit } = crea({ scadenze: [SCADENZA] });

    const esito = await service.aggiornaImportiScadenze(1, 'operatore@studio.it');

    expect(esito).toEqual({ aggiornate: 1, nonCalcolabili: 0, motivi: [] });
    expect(prisma.scadenza.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: { importoPrevisto: 219.3 },
    });
    expect(audit.registra).toHaveBeenCalledWith(
      expect.objectContaining({ entita: 'scadenza', idEntita: 50, utente: 'operatore@studio.it' }),
    );
  });

  it('non sovrascrive l\'importo esistente se il bollo non è calcolabile', async () => {
    // Il motore precedente scriveva zero, cancellando l'importo importato
    // dall'archivio o inserito a mano.
    const { service, prisma } = crea({
      veicolo: { ...VEICOLO, potenzaKw: null },
      scadenze: [SCADENZA],
    });

    const esito = await service.aggiornaImportiScadenze(1);

    expect(prisma.scadenza.update).not.toHaveBeenCalled();
    expect(esito.aggiornate).toBe(0);
    expect(esito.nonCalcolabili).toBe(1);
    expect(esito.motivi).toEqual(['Dato mancante: potenza (KW).']);
  });
});
