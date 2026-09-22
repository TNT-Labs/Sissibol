/**
 * Utilità per i test di integrazione: connessione al database di test,
 * azzeramento fra un test e l'altro e creazione dei dati di partenza.
 *
 * I test di integrazione girano su un PostgreSQL reale perché molte parti del
 * sistema (filtri annidati su cliente/veicolo, transazioni, updateMany con OR,
 * vincoli di integrità) non sono verificabili con un mock di Prisma.
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { TariffarioFixture } from '../../golden/tariffario.types';

/**
 * URL del database di test. Volutamente separato da DATABASE_URL: un test che
 * azzera le tabelle non deve poter puntare per sbaglio a un database di lavoro.
 */
export function getTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Serve DATABASE_URL_TEST (o DATABASE_URL) per i test di integrazione.\n' +
        'Esempio: DATABASE_URL_TEST=postgresql://user:pass@localhost:5432/sissibol_test npm run test:integration',
    );
  }
  return url;
}

let client: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      datasources: { db: { url: getTestDatabaseUrl() } },
    });
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}

/** Tabelle azzerate fra un test e l'altro, in ordine irrilevante grazie a CASCADE. */
const TABELLE = [
  'snapshot_calcolo_bollo',
  'pagamenti',
  'scadenze',
  'storico_veicoli',
  'veicoli',
  'clienti',
  'refresh_tokens',
  'utenti',
  'tariffe_bollo',
  'esenzioni_bollo',
  'configurazioni_bollo',
];

export async function resetDatabase(): Promise<void> {
  const prisma = getPrisma();
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABELLE.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

/**
 * Inserisce il tariffario reale partendo dallo stesso fixture usato dal golden
 * master, così i due livelli di test non possono divergere.
 */
export async function seedTariffario(): Promise<void> {
  const prisma = getPrisma();
  const fixture: TariffarioFixture = JSON.parse(
    readFileSync(
      join(__dirname, '../../golden/fixtures/tariffario.json'),
      'utf-8',
    ),
  );

  for (const c of fixture.configurazioni) {
    const config = await prisma.configurazioneBollo.create({
      data: {
        annoValidita: c.annoValidita,
        regione: c.regione,
        scontoRid: c.scontoRid,
        attivo: c.attivo,
        note: c.note,
      },
    });

    await prisma.tariffaBollo.createMany({
      data: c.tariffe.map((t) => ({
        idConfigurazione: config.id,
        tipoVeicolo: t.tipoVeicolo,
        categoriaEuro: t.categoriaEuro,
        unitaMisura: t.unitaMisura,
        sogliaMin: t.sogliaMin,
        sogliaMax: t.sogliaMax,
        importoUnitario: t.importoUnitario,
        importoFisso: t.importoFisso,
        tipoSospensione: t.tipoSospensione,
        periodicita: t.periodicita,
        descrizione: t.descrizione,
        ordine: t.ordine,
      })),
    });

    await prisma.esenzioneBollo.createMany({
      data: c.esenzioni.map((e) => ({
        idConfigurazione: config.id,
        tipoEsenzione: e.tipo_esenzione,
        percentualeRiduzione: e.percentuale_riduzione,
        tipoVeicolo: e.tipo_veicolo,
        alimentazione: e.alimentazione,
        anniDaImmatricolazione: e.anni_da_immatricolazione,
        descrizione: e.descrizione,
        note: e.note,
      })),
    });
  }
}

// =====================================================
// FACTORY
// =====================================================

export async function creaCliente(
  override: Partial<{
    ragioneSociale: string;
    email: string;
    attivo: boolean;
  }> = {},
) {
  return getPrisma().cliente.create({
    data: {
      tipoCliente: 'PERSONA_GIURIDICA',
      ragioneSociale: override.ragioneSociale ?? 'Trasporti Test Srl',
      email: override.email ?? 'test@example.com',
      attivo: override.attivo ?? true,
    },
  });
}

export async function creaVeicolo(
  idCliente: number,
  override: Partial<{
    targa: string;
    tipoVeicolo: string;
    classeAmbientale: string;
    regione: string;
    alimentazione: string;
    potenzaKw: string;
    pesoComplessivoKg: number;
    portataKg: number;
    numeroAssi: number;
    tipoSospensione: string;
    dataImmatricolazione: Date;
    attivo: boolean;
  }> = {},
) {
  return getPrisma().veicolo.create({
    data: {
      idCliente,
      targa: override.targa ?? `TEST${Math.floor(Math.random() * 100000)}`,
      tipoVeicolo: override.tipoVeicolo ?? 'Autovettura',
      classeAmbientale: override.classeAmbientale ?? 'Euro 6',
      regione: override.regione ?? 'Lombardia',
      alimentazione: override.alimentazione ?? 'Diesel',
      potenzaKw: override.potenzaKw ?? '100',
      pesoComplessivoKg: override.pesoComplessivoKg,
      portataKg: override.portataKg,
      numeroAssi: override.numeroAssi,
      tipoSospensione: override.tipoSospensione,
      dataImmatricolazione: override.dataImmatricolazione,
      attivo: override.attivo ?? true,
    },
  });
}

export async function creaScadenza(
  idVeicolo: number,
  override: Partial<{
    meseScadenza: number;
    annoScadenza: number;
    periodicita: 'ANNUALE' | 'QUADRIMESTRALE';
    /** Passare esplicitamente `null` per una scadenza senza importo previsto. */
    importoPrevisto: string | null;
    stato: 'DA_PAGARE' | 'PAGATO' | 'SCADUTO';
  }> = {},
) {
  // `??` non basta: serve distinguere "non specificato" da "esplicitamente
  // null", perché una scadenza senza importo previsto è un caso da testare.
  const importoPrevisto =
    'importoPrevisto' in override ? override.importoPrevisto : '258';

  return getPrisma().scadenza.create({
    data: {
      idVeicolo,
      meseScadenza: override.meseScadenza ?? 6,
      annoScadenza: override.annoScadenza ?? 2026,
      periodicita: override.periodicita ?? 'ANNUALE',
      importoPrevisto,
      stato: override.stato ?? 'DA_PAGARE',
    },
  });
}
