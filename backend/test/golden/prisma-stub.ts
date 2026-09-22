/**
 * Stub di PrismaService che serve al motore di calcolo i dati dei fixture.
 *
 * Riproduce esattamente le tre letture che `BolloService.calcolaBollo` esegue:
 *   1. `veicolo.findUnique({ where: { id }, include: { cliente: true } })`
 *   2. `configurazioneBollo.findFirst({ where: { annoValidita, regione, attivo } })`
 *      con il fallback alla regione 'DEFAULT'
 *   3. `$queryRaw` sulle esenzioni, ordinate come nella query del servizio
 *
 * Usare lo stub al posto del database rende il golden master eseguibile in CI
 * in pochi secondi e senza dipendenze esterne.
 */

import { Decimal } from '@prisma/client/runtime/library';
import type {
  ConfigurazioneFixture,
  EsenzioneFixture,
  TariffarioFixture,
  VeicoloFixture,
} from './tariffario.types';

function toDecimal(value: string | null): Decimal | null {
  return value === null ? null : new Decimal(value);
}

/** Converte un veicolo del fixture nella forma restituita da Prisma. */
export function hydrateVeicolo(v: VeicoloFixture): Record<string, unknown> {
  return {
    ...v,
    potenzaKw: toDecimal(v.potenzaKw),
    dataImmatricolazione: v.dataImmatricolazione
      ? new Date(v.dataImmatricolazione)
      : null,
    cliente: { id: v.idCliente },
  };
}

function hydrateConfigurazione(c: ConfigurazioneFixture): Record<string, unknown> {
  return {
    id: c.id,
    annoValidita: c.annoValidita,
    regione: c.regione,
    scontoRid: new Decimal(c.scontoRid),
    attivo: c.attivo,
    note: c.note,
    tariffe: c.tariffe.map((t) => ({
      ...t,
      sogliaMin: toDecimal(t.sogliaMin),
      sogliaMax: toDecimal(t.sogliaMax),
      importoUnitario: new Decimal(t.importoUnitario),
      importoFisso: toDecimal(t.importoFisso),
    })),
  };
}

/**
 * Riproduce l'ORDER BY della query esenzioni in `BolloService`:
 *   TOTALE prima di PARZIALE, poi percentuale di riduzione decrescente
 *   (con COALESCE a 100 per le totali).
 */
function ordinaEsenzioni(esenzioni: EsenzioneFixture[]): EsenzioneFixture[] {
  return [...esenzioni].sort((a, b) => {
    const pesoA = a.tipo_esenzione === 'TOTALE' ? 0 : 1;
    const pesoB = b.tipo_esenzione === 'TOTALE' ? 0 : 1;
    if (pesoA !== pesoB) return pesoA - pesoB;

    const percA = a.percentuale_riduzione === null ? 100 : Number(a.percentuale_riduzione);
    const percB = b.percentuale_riduzione === null ? 100 : Number(b.percentuale_riduzione);
    if (percA !== percB) return percB - percA;

    return a.id - b.id;
  });
}

export function createPrismaStub(
  tariffario: TariffarioFixture,
  veicoli: VeicoloFixture[],
) {
  const veicoliById = new Map<number, VeicoloFixture>(
    veicoli.map((v) => [v.id, v]),
  );

  return {
    veicolo: {
      findUnique: async (args: { where: { id: number } }) => {
        const v = veicoliById.get(args.where.id);
        return v ? hydrateVeicolo(v) : null;
      },
    },

    configurazioneBollo: {
      findFirst: async (args: {
        where: { annoValidita: number; regione: string; attivo: boolean };
      }) => {
        const match = tariffario.configurazioni.find(
          (c) =>
            c.annoValidita === args.where.annoValidita &&
            c.regione === args.where.regione &&
            c.attivo === args.where.attivo,
        );
        return match ? hydrateConfigurazione(match) : null;
      },
    },

    /**
     * Il servizio invoca `$queryRaw` come template tag: il primo argomento è
     * l'array dei frammenti di testo, i successivi i valori interpolati.
     * L'unica query raw del motore filtra per id configurazione.
     */
    $queryRaw: async (
      _strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<EsenzioneFixture[]> => {
      const idConfigurazione = Number(values[0]);
      const config = tariffario.configurazioni.find(
        (c) => c.id === idConfigurazione,
      );
      if (!config) return [];
      return ordinaEsenzioni(config.esenzioni);
    },
  };
}

export type PrismaStub = ReturnType<typeof createPrismaStub>;
