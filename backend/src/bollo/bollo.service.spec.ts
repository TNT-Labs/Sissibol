import { BolloService } from './bollo.service';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Unit test sul calcolo bollo con PrismaService mockato.
 * Copre il tariffario a scaglioni per KW e la logica delle esenzioni
 * (totali, parziali, elettrico entro/oltre 5 anni, veicoli storici).
 */

// Tariffe autovettura Euro 4-5-6 (valori Lombardia 2026)
const tariffeAutovettura = [
  {
    tipoVeicolo: 'Autovettura',
    categoriaEuro: 'Euro 4-5-6',
    unitaMisura: 'KW',
    sogliaMin: new Decimal(0),
    sogliaMax: new Decimal(100),
    importoUnitario: new Decimal(2.58),
    importoFisso: null,
    periodicita: 'ANNUALE',
    descrizione: null,
  },
  {
    tipoVeicolo: 'Autovettura',
    categoriaEuro: 'Euro 4-5-6',
    unitaMisura: 'KW',
    sogliaMin: new Decimal(100),
    sogliaMax: null,
    importoUnitario: new Decimal(3.87),
    importoFisso: null,
    periodicita: 'ANNUALE',
    descrizione: null,
  },
];

interface MockSetup {
  veicolo: Record<string, unknown>;
  esenzioni?: Record<string, unknown>[];
  scontoRid?: number;
}

function createService({ veicolo, esenzioni = [], scontoRid = 15 }: MockSetup): BolloService {
  const prismaMock = {
    veicolo: {
      findUnique: jest.fn().mockResolvedValue(veicolo),
    },
    configurazioneBollo: {
      findFirst: jest.fn().mockResolvedValue({
        id: 1,
        annoValidita: 2026,
        regione: 'Lombardia',
        scontoRid: new Decimal(scontoRid),
        attivo: true,
        tariffe: tariffeAutovettura,
      }),
    },
    $queryRaw: jest.fn().mockResolvedValue(esenzioni),
  };
  return new BolloService(prismaMock as any);
}

const veicoloBase = {
  id: 1,
  targa: 'AB123CD',
  tipoVeicolo: 'Autovettura',
  classeAmbientale: 'Euro 6',
  potenzaKw: new Decimal(85),
  alimentazione: 'Benzina',
  regione: 'Lombardia',
  dataImmatricolazione: null,
  cliente: { id: 1 },
};

describe('BolloService - calcolo autovettura', () => {
  it('calcola il bollo a scaglioni per KW (entro la prima fascia)', async () => {
    const service = createService({ veicolo: veicoloBase });
    const result = await service.calcolaBollo(1, 2026);
    // 85 KW × 2.58 = 219.30
    expect(result.importoBase).toBe(219.3);
    // Sconto RID 15%: 219.30 × 0.85 = 186.41
    expect(result.importoRidotto).toBe(186.41);
  });

  it('applica lo scaglione superiore oltre i 100 KW', async () => {
    const service = createService({
      veicolo: { ...veicoloBase, potenzaKw: new Decimal(120) },
    });
    const result = await service.calcolaBollo(1, 2026);
    // 100 × 2.58 + 20 × 3.87 = 258 + 77.40 = 335.40
    expect(result.importoBase).toBe(335.4);
  });

  it('restituisce 0 con nota se manca la potenza', async () => {
    const service = createService({
      veicolo: { ...veicoloBase, potenzaKw: null },
    });
    const result = await service.calcolaBollo(1, 2026);
    expect(result.importoBase).toBe(0);
    expect(result.note.join(' ')).toContain('Potenza KW non specificata');
  });
});

describe('BolloService - esenzioni', () => {
  const esenzioneElettricoTotale = {
    id: 1,
    id_configurazione: 1,
    tipo_esenzione: 'TOTALE',
    percentuale_riduzione: null,
    tipo_veicolo: null,
    alimentazione: 'Elettrico',
    anni_da_immatricolazione: 5,
    descrizione: 'Elettrico primi 5 anni',
    note: null,
  };
  const esenzioneElettricoParziale = {
    id: 2,
    id_configurazione: 1,
    tipo_esenzione: 'PARZIALE',
    percentuale_riduzione: 75,
    tipo_veicolo: null,
    alimentazione: 'Elettrico',
    anni_da_immatricolazione: null,
    descrizione: 'Elettrico oltre 5 anni',
    note: null,
  };
  const esenzioneGpl = {
    id: 3,
    id_configurazione: 1,
    tipo_esenzione: 'PARZIALE',
    percentuale_riduzione: 25,
    tipo_veicolo: null,
    alimentazione: 'GPL',
    anni_da_immatricolazione: null,
    descrizione: 'GPL riduzione 25%',
    note: null,
  };
  const esenzioneStorico = {
    id: 4,
    id_configurazione: 1,
    tipo_esenzione: 'PARZIALE',
    percentuale_riduzione: 50,
    tipo_veicolo: null,
    alimentazione: null,
    anni_da_immatricolazione: 30,
    descrizione: 'Ultratrentennali riduzione 50%',
    note: null,
  };

  function dataImmAnniFa(anni: number): Date {
    const d = new Date();
    d.setFullYear(d.getFullYear() - anni);
    return d;
  }

  it('elettrico entro 5 anni: esenzione totale, importo 0', async () => {
    const service = createService({
      veicolo: {
        ...veicoloBase,
        alimentazione: 'Elettrico',
        dataImmatricolazione: dataImmAnniFa(2),
      },
      esenzioni: [esenzioneElettricoTotale, esenzioneElettricoParziale],
    });
    const result = await service.calcolaBollo(1, 2026);
    expect(result.importoBase).toBe(0);
    expect(result.esenzioni[0].tipo).toBe('TOTALE');
  });

  it('elettrico oltre 5 anni: NON esente, riduzione parziale 75%', async () => {
    const service = createService({
      veicolo: {
        ...veicoloBase,
        alimentazione: 'Elettrico',
        dataImmatricolazione: dataImmAnniFa(11),
      },
      esenzioni: [esenzioneElettricoTotale, esenzioneElettricoParziale],
    });
    const result = await service.calcolaBollo(1, 2026);
    // 219.30 × 0.25 = 54.83 (arrotondato)
    expect(result.importoBase).toBeCloseTo(54.83, 2);
    expect(result.esenzioni).toHaveLength(1);
    expect(result.esenzioni[0].tipo).toBe('PARZIALE');
    expect(result.esenzioni[0].percentualeRiduzione).toBe(75);
  });

  it('GPL: riduzione parziale 25%', async () => {
    const service = createService({
      veicolo: { ...veicoloBase, alimentazione: 'GPL' },
      esenzioni: [esenzioneGpl],
    });
    const result = await service.calcolaBollo(1, 2026);
    // 219.30 × 0.75 = 164.48
    expect(result.importoBase).toBeCloseTo(164.48, 2);
  });

  it('veicolo storico oltre 30 anni: riduzione 50%', async () => {
    const service = createService({
      veicolo: { ...veicoloBase, dataImmatricolazione: dataImmAnniFa(36) },
      esenzioni: [esenzioneStorico],
    });
    const result = await service.calcolaBollo(1, 2026);
    expect(result.importoBase).toBeCloseTo(219.3 * 0.5, 2);
  });

  it('veicolo recente: nessuna esenzione storica', async () => {
    const service = createService({
      veicolo: { ...veicoloBase, dataImmatricolazione: dataImmAnniFa(5) },
      esenzioni: [esenzioneStorico],
    });
    const result = await service.calcolaBollo(1, 2026);
    expect(result.importoBase).toBe(219.3);
    expect(result.esenzioni).toHaveLength(0);
  });
});
