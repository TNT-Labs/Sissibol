/**
 * Test di integrazione del seed del database.
 *
 * Il seed crea l'utente amministratore e il tariffario: se fallisce, una
 * nuova installazione resta senza tariffe e nessun bollo è calcolabile.
 * È già successo: la migrazione che ha reso obbligatoria la validità del
 * tariffario ha rotto il seed, e l'errore è passato inosservato perché
 * l'avvio Docker lo esegue con `|| echo 'Seed skipped'`.
 *
 * Il test verifica anche che il tariffario creato dal seed coincida con
 * quello su cui gira il golden master: se divergessero, la produzione
 * calcolerebbe su tariffe diverse da quelle verificate dai test.
 */

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { TariffarioFixture } from '../golden/tariffario.types';
import { disconnectPrisma, getPrisma, getTestDatabaseUrl, resetDatabase } from './setup/test-db';

const BACKEND = join(__dirname, '../..');

function eseguiSeed(): string {
  return execFileSync('node', ['prisma/seed.js'], {
    cwd: BACKEND,
    env: { ...process.env, DATABASE_URL: getTestDatabaseUrl() },
    encoding: 'utf-8',
  });
}

/** Forma confrontabile di una tariffa, indipendente da id e formattazione. */
function firma(t: {
  tipoVeicolo: string;
  categoriaEuro: string | null;
  unitaMisura: string;
  sogliaMin: unknown;
  sogliaMax: unknown;
  importoUnitario: unknown;
  importoFisso: unknown;
  tipoSospensione: string | null;
  periodicita: string;
}): string {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(String(v)));
  return JSON.stringify([
    t.tipoVeicolo,
    t.categoriaEuro,
    t.unitaMisura,
    n(t.sogliaMin),
    n(t.sogliaMax),
    n(t.importoUnitario),
    n(t.importoFisso),
    t.tipoSospensione,
    t.periodicita,
  ]);
}

describe('Seed del database (integrazione)', () => {
  const prisma = getPrisma();

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('crea il tariffario Lombardia 2026 con la sua validità', async () => {
    eseguiSeed();

    const config = await prisma.configurazioneBollo.findFirst({
      where: { regione: 'Lombardia', annoValidita: 2026 },
      include: { tariffe: true, esenzioni: true },
    });

    expect(config).not.toBeNull();
    expect(config.validoDa.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(config.validoA.toISOString().slice(0, 10)).toBe('2026-12-31');
    expect(config.tariffe.length).toBeGreaterThan(0);
    expect(config.esenzioni.length).toBeGreaterThan(0);
  });

  it('crea l\'utente amministratore', async () => {
    eseguiSeed();
    expect(await prisma.utente.count({ where: { ruolo: 'ADMIN' } })).toBe(1);
  });

  it('è ripetibile: una seconda esecuzione non duplica nulla', async () => {
    eseguiSeed();
    eseguiSeed();

    expect(await prisma.configurazioneBollo.count()).toBe(1);
    expect(await prisma.utente.count()).toBe(1);
  });

  it('produce esattamente il tariffario su cui gira il golden master', async () => {
    eseguiSeed();

    const fixture: TariffarioFixture = JSON.parse(
      readFileSync(join(__dirname, '../golden/fixtures/tariffario.json'), 'utf-8'),
    );
    const atteso = fixture.configurazioni.find((c) => c.regione === 'Lombardia' && c.annoValidita === 2026);
    const config = await prisma.configurazioneBollo.findFirst({
      where: { regione: 'Lombardia', annoValidita: 2026 },
      include: { tariffe: true, esenzioni: true },
    });

    expect(config.tariffe.map(firma).sort()).toEqual(atteso.tariffe.map(firma).sort());
    expect(Number(config.scontoRid)).toBe(Number(atteso.scontoRid));

    const esenzione = (e: {
      tipoEsenzione: string;
      percentualeRiduzione: unknown;
      tipoVeicolo: string | null;
      alimentazione: string | null;
      anniDaImmatricolazione: number | null;
    }) =>
      JSON.stringify([
        e.tipoEsenzione,
        e.percentualeRiduzione === null ? null : Number(String(e.percentualeRiduzione)),
        e.tipoVeicolo,
        e.alimentazione,
        e.anniDaImmatricolazione,
      ]);
    expect(config.esenzioni.map(esenzione).sort()).toEqual(
      atteso.esenzioni
        .map((e) =>
          esenzione({
            tipoEsenzione: e.tipo_esenzione,
            percentualeRiduzione: e.percentuale_riduzione,
            tipoVeicolo: e.tipo_veicolo,
            alimentazione: e.alimentazione,
            anniDaImmatricolazione: e.anni_da_immatricolazione,
          }),
        )
        .sort(),
    );
  });
});
