/**
 * Esecuzione del motore di calcolo su tutto il corpus.
 *
 * Questa funzione è condivisa fra il generatore dei fixture
 * (`test/tools/generate-golden.ts`) e il test che li verifica
 * (`test/golden/golden-master.spec.ts`): se le due esecuzioni usassero
 * percorsi diversi, il golden master non garantirebbe nulla.
 */

import { BolloService } from '../../src/bollo/bollo.service';
import { withFrozenTime } from '../helpers/frozen-time';
import { createPrismaStub } from './prisma-stub';
import type {
  CorpusFixture,
  GoldenEntry,
  GoldenFixture,
  TariffarioFixture,
  VeicoloFixture,
} from './tariffario.types';

/** Anni e periodicità su cui il golden master fissa il comportamento. */
export const ANNO_CALCOLO = 2026;
export const PERIODICITA: Array<'ANNUALE' | 'QUADRIMESTRALE'> = [
  'ANNUALE',
  'QUADRIMESTRALE',
];

function arrotonda(n: number): number {
  // Normalizza gli errori di rappresentazione dei float prima del confronto,
  // altrimenti 219.29999999999998 e 219.3 risulterebbero diversi.
  return Math.round(n * 100) / 100;
}

async function calcolaVoce(
  service: BolloService,
  veicolo: VeicoloFixture,
  periodicita: 'ANNUALE' | 'QUADRIMESTRALE',
): Promise<GoldenEntry> {
  const base = {
    targa: veicolo.targa,
    tipoVeicolo: veicolo.tipoVeicolo,
    regione: veicolo.regione,
    anno: ANNO_CALCOLO,
    periodicita,
  };

  try {
    const r = await service.calcolaBollo(
      veicolo.id,
      ANNO_CALCOLO,
      periodicita,
    );
    return {
      ...base,
      esito: 'OK',
      importoBase: arrotonda(r.importoBase),
      importoRidotto: r.importoRidotto === null ? null : arrotonda(r.importoRidotto),
      scontoRid: r.scontoRid,
      esenzioni: r.esenzioni,
      tariffeApplicate: r.tariffeApplicate.map((t) => ({
        ...t,
        importo: arrotonda(t.importo),
      })),
      note: r.note,
      dettaglioCalcolo: r.dettaglioCalcolo,
    };
  } catch (error) {
    // Un'eccezione è un esito legittimo da fissare: oggi i veicoli di regioni
    // senza tariffario configurato falliscono, e il golden master lo registra
    // così che una modifica futura non lo cambi in silenzio.
    return {
      ...base,
      esito: 'ERRORE',
      errore: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function computeGolden(
  corpus: CorpusFixture,
  tariffario: TariffarioFixture,
  dataRiferimento: string,
): Promise<GoldenFixture> {
  const veicoli = [...corpus.reali, ...corpus.sintetici];
  const prisma = createPrismaStub(tariffario, veicoli);
  const service = new BolloService(prisma as never);

  const risultati = await withFrozenTime(dataRiferimento, async () => {
    const out: GoldenEntry[] = [];
    for (const veicolo of veicoli) {
      for (const periodicita of PERIODICITA) {
        out.push(await calcolaVoce(service, veicolo, periodicita));
      }
    }
    return out;
  });

  return {
    generatoIl: new Date().toISOString(),
    dataRiferimento,
    riepilogo: costruisciRiepilogo(risultati),
    risultati,
  };
}

/**
 * Conteggi aggregati: rendono immediatamente leggibile, nel diff di una PR,
 * se un refactor ha spostato veicoli fra le categorie di esito.
 */
export function costruisciRiepilogo(
  risultati: GoldenEntry[],
): Record<string, number> {
  const riepilogo: Record<string, number> = {
    totale: risultati.length,
    esitoOk: 0,
    esitoErrore: 0,
    importoZero: 0,
    importoPositivo: 0,
    conEsenzioni: 0,
    conNote: 0,
  };

  for (const r of risultati) {
    if (r.esito === 'ERRORE') {
      riepilogo.esitoErrore++;
      continue;
    }
    riepilogo.esitoOk++;
    if ((r.importoBase ?? 0) === 0) riepilogo.importoZero++;
    else riepilogo.importoPositivo++;
    if ((r.esenzioni ?? []).length > 0) riepilogo.conEsenzioni++;
    if ((r.note ?? []).length > 0) riepilogo.conNote++;
  }

  return riepilogo;
}
