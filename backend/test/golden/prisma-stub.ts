/**
 * Stub di PrismaService che serve a BolloService i dati dei fixture.
 *
 * Riproduce le due letture che `BolloService.calcolaBollo` esegue:
 *   1. `veicolo.findUnique({ where: { id } })`
 *   2. `configurazioneBollo.findFirst({ where: { annoValidita, regione, attivo },
 *      include: { tariffe, esenzioni } })`, con il ripiego su 'DEFAULT'
 *
 * Usare lo stub al posto del database rende il golden master eseguibile in CI
 * in pochi secondi e senza dipendenze esterne.
 */

import { Decimal } from '@prisma/client/runtime/library';
import type {
  ConfigurazioneFixture,
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
    tariffe: [...c.tariffe]
      .sort((a, b) => a.id - b.id)
      .map((t) => ({
        ...t,
        sogliaMin: toDecimal(t.sogliaMin),
        sogliaMax: toDecimal(t.sogliaMax),
        importoUnitario: new Decimal(t.importoUnitario),
        importoFisso: toDecimal(t.importoFisso),
      })),
    // Forma del modello Prisma (camelCase), ordinata per id come nella
    // query del servizio.
    esenzioni: [...c.esenzioni]
      .sort((a, b) => a.id - b.id)
      .map((e) => ({
        id: e.id,
        idConfigurazione: e.id_configurazione,
        tipoEsenzione: e.tipo_esenzione,
        percentualeRiduzione: toDecimal(e.percentuale_riduzione),
        tipoVeicolo: e.tipo_veicolo,
        alimentazione: e.alimentazione,
        anniDaImmatricolazione: e.anni_da_immatricolazione,
        descrizione: e.descrizione,
        note: e.note,
      })),
  };
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
  };
}

export type PrismaStub = ReturnType<typeof createPrismaStub>;
