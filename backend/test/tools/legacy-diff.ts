/**
 * Confronta gli importi calcolati dal motore con quelli realmente addebitati
 * nell'archivio Access.
 *
 * Non è un test: è la misura di quanto il motore è lontano dalla realtà.
 * L'archivio contiene, per ogni scadenza, il bollo effettivamente pagato; è
 * l'unico riferimento oggettivo disponibile. Il divario misurato qui è la
 * metrica che il rifacimento del motore di calcolo dovrà ridurre, e questo
 * strumento serve a verificarne i progressi.
 *
 * Uso:
 *   DATABASE_URL=... npx ts-node test/tools/legacy-diff.ts [anno]
 */

import { PrismaClient } from '@prisma/client';
import { BolloService } from '../../src/bollo/bollo.service';
import { AuditService } from '../../src/audit/audit.service';

const prisma = new PrismaClient();

const ANNO = process.argv[2] ? parseInt(process.argv[2], 10) : 2026;
/** Scarto oltre il quale l'importo si considera diverso. */
const TOLLERANZA_EUR = 0.01;

interface Riga {
  targa: string;
  tipoVeicolo: string | null;
  legacy: number;
  /** null se non calcolabile o in errore */
  calcolato: number | null;
  esito: 'CALCOLATO' | 'ESENTE' | 'NON_CALCOLABILE' | 'ERRORE';
  errore?: string;
}

async function main() {
  const bollo = new BolloService(prisma as never, new AuditService(prisma as never));

  // Per ogni veicolo, l'importo più recente presente in archivio.
  const scadenze = await prisma.scadenza.findMany({
    where: { importoPrevisto: { not: null } },
    orderBy: [{ annoScadenza: 'desc' }, { meseScadenza: 'desc' }],
    select: {
      idVeicolo: true,
      importoPrevisto: true,
      periodicita: true,
      veicolo: { select: { targa: true, tipoVeicolo: true } },
    },
  });

  const piuRecentePerVeicolo = new Map<number, (typeof scadenze)[number]>();
  for (const s of scadenze) {
    if (!piuRecentePerVeicolo.has(s.idVeicolo)) {
      piuRecentePerVeicolo.set(s.idVeicolo, s);
    }
  }

  console.log(
    `Confronto su ${piuRecentePerVeicolo.size} veicoli con importo in archivio (tariffario ${ANNO})\n`,
  );

  const configCache = new Map<string, unknown>();
  const righe: Riga[] = [];

  for (const [idVeicolo, s] of piuRecentePerVeicolo) {
    const legacy = Number(s.importoPrevisto);
    try {
      const r = await bollo.calcolaBollo(
        idVeicolo,
        ANNO,
        s.periodicita as 'ANNUALE' | 'QUADRIMESTRALE',
        configCache as never,
      );
      righe.push({
        targa: s.veicolo.targa,
        tipoVeicolo: s.veicolo.tipoVeicolo,
        legacy,
        calcolato: r.importoBase,
        esito: r.esito,
      });
    } catch (error) {
      righe.push({
        targa: s.veicolo.targa,
        tipoVeicolo: s.veicolo.tipoVeicolo,
        legacy,
        calcolato: null,
        esito: 'ERRORE',
        errore: error instanceof Error ? error.message : String(error),
      });
    }
  }

  stampaRapporto(righe);
}

function stampaRapporto(righe: Riga[]) {
  const coincidenti = righe.filter(
    (r) => r.calcolato !== null && Math.abs(r.calcolato - r.legacy) <= TOLLERANZA_EUR,
  );
  const esenti = righe.filter((r) => r.esito === 'ESENTE');
  const nonCalcolabili = righe.filter((r) => r.esito === 'NON_CALCOLABILE');
  const diversi = righe.filter(
    (r) =>
      r.esito === 'CALCOLATO' &&
      r.calcolato !== null &&
      Math.abs(r.calcolato - r.legacy) > TOLLERANZA_EUR,
  );
  const inErrore = righe.filter((r) => r.esito === 'ERRORE');

  const pct = (n: number) => `${((n / righe.length) * 100).toFixed(1)}%`;

  console.log('=== RIEPILOGO ===');
  console.log(`  veicoli confrontati:        ${righe.length}`);
  console.log(`  importo coincidente:        ${coincidenti.length} (${pct(coincidenti.length)})`);
  console.log(`  esente:                     ${esenti.length} (${pct(esenti.length)})`);
  console.log(`  non calcolabile:            ${nonCalcolabili.length} (${pct(nonCalcolabili.length)})`);
  console.log(`  importo diverso:            ${diversi.length} (${pct(diversi.length)})`);
  console.log(`  calcolo in errore:          ${inErrore.length} (${pct(inErrore.length)})`);

  const totaleLegacy = righe.reduce((s, r) => s + r.legacy, 0);
  const totaleCalcolato = righe.reduce((s, r) => s + (r.calcolato ?? 0), 0);
  console.log(`\n  totale a archivio:  € ${totaleLegacy.toFixed(2)}`);
  console.log(`  totale calcolato:   € ${totaleCalcolato.toFixed(2)}`);
  console.log(
    `  differenza:         € ${(totaleCalcolato - totaleLegacy).toFixed(2)}`,
  );

  // Ripartizione per tipo veicolo: dice da dove conviene iniziare a correggere.
  console.log('\n=== PER TIPO VEICOLO ===');
  const perTipo = new Map<string, { n: number; ok: number; nc: number; legacy: number }>();
  for (const r of righe) {
    const k = r.tipoVeicolo ?? '(non specificato)';
    const acc = perTipo.get(k) ?? { n: 0, ok: 0, nc: 0, legacy: 0 };
    acc.n++;
    acc.legacy += r.legacy;
    if (r.calcolato !== null && Math.abs(r.calcolato - r.legacy) <= TOLLERANZA_EUR) acc.ok++;
    if (r.esito === 'NON_CALCOLABILE') acc.nc++;
    perTipo.set(k, acc);
  }
  for (const [tipo, a] of [...perTipo.entries()].sort((x, y) => y[1].legacy - x[1].legacy)) {
    console.log(
      `  ${tipo.padEnd(24)} veicoli=${String(a.n).padStart(5)}  coincidenti=${String(a.ok).padStart(5)}  non calcolabili=${String(a.nc).padStart(5)}  € archivio=${a.legacy.toFixed(2).padStart(12)}`,
    );
  }

  if (diversi.length > 0) {
    console.log('\n=== PRIMI SCOSTAMENTI (calcolo non nullo ma diverso) ===');
    for (const r of diversi
      .sort((a, b) => Math.abs(b.calcolato! - b.legacy) - Math.abs(a.calcolato! - a.legacy))
      .slice(0, 20)) {
      console.log(
        `  ${r.targa.padEnd(10)} ${(r.tipoVeicolo ?? '-').padEnd(20)} archivio=${r.legacy.toFixed(2).padStart(9)}  calcolato=${r.calcolato!.toFixed(2).padStart(9)}  delta=${(r.calcolato! - r.legacy).toFixed(2).padStart(10)}`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
