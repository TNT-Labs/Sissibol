/**
 * Rapporto sulla completezza dei dati dei veicoli, da riga di comando.
 *
 * Stampa lo stesso rapporto della pagina "Dati veicoli" dell'applicazione:
 * usa lo stesso servizio (CompletezzaService), quindi i due non possono
 * divergere. I dati richiesti non sono elencati a mano: li dice il motore di
 * calcolo, veicolo per veicolo.
 *
 * Uso:
 *   DATABASE_URL=... npx ts-node test/tools/completezza-dati.ts [--anno 2026] [--csv percorso.csv]
 */

import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { BolloService } from '../../src/bollo/bollo.service';
import { AuditService } from '../../src/audit/audit.service';
import { CompletezzaService } from '../../src/completezza/completezza.service';

const prisma = new PrismaClient();

function argomento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const anno = Number(argomento('--anno') ?? new Date().getFullYear());
  const servizio = new CompletezzaService(
    prisma as never,
    new BolloService(prisma as never, new AuditService(prisma as never)),
  );

  const { rapporto: r, righe } = await servizio.elenco({ stato: 'TUTTI', perPagina: 5000 }, anno);
  const pct = (n: number) => `${((n / Math.max(r.totale, 1)) * 100).toFixed(1)}%`;

  console.log(`=== COMPLETEZZA DATI VEICOLI (tariffario ${anno}) ===\n`);
  console.log(`  veicoli attivi:                ${r.totale}`);
  console.log(`  bollo calcolabile:             ${r.calcolabili} (${pct(r.calcolabili)})`);
  console.log(`  bollo non calcolabile:         ${r.nonCalcolabili} (${pct(r.nonCalcolabili)})`);
  console.log(`  scadenze senza importo (anni con tariffario): ${r.scadenzeSenzaImporto}`);

  console.log('\n=== DATI INDISPENSABILI MANCANTI (un veicolo può averne più di uno) ===');
  for (const c of r.perCampo) {
    console.log(`  ${String(c.veicoli).padStart(5)}x  ${c.etichetta.padEnd(24)} ${c.doveTrovarlo ?? ''}`);
  }
  console.log('\n  Nota: si vede solo il primo blocco di ogni veicolo. Chi non ha il tipo, per');
  console.log('  esempio, avrà quasi certamente bisogno anche di potenza o peso una volta indicato.');

  if (r.problemiTariffario.length) {
    console.log('\n=== PROBLEMI DEL TARIFFARIO (da correggere nella pagina Tariffe) ===');
    for (const t of r.problemiTariffario) console.log(`  ${String(t.veicoli).padStart(5)}x  ${t.messaggio}`);
  }

  if (r.perConsigliato.length) {
    console.log('\n=== DATI CONSIGLIATI (esenzioni e riduzioni non valutate senza di essi) ===');
    for (const c of r.perConsigliato) {
      console.log(`  ${String(c.veicoli).padStart(5)}x  ${c.etichetta.padEnd(24)} ${c.doveTrovarlo ?? ''}`);
    }
  }

  const csv = argomento('--csv');
  if (csv) {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const daLavorare = righe.filter((v) => v.mancanti.length || v.consigliati.length || v.tariffario.length);
    const contenuto = [
      'Targa,Cliente,TipoVeicolo,DatiMancanti,DoveTrovarli,DatiConsigliati,ProblemiTariffario',
      ...daLavorare.map((v) =>
        [
          v.targa,
          v.cliente,
          v.tipoVeicolo ?? '',
          v.mancanti.map((m) => m.etichetta).join('; '),
          v.mancanti.map((m) => m.doveTrovarlo).filter(Boolean).join('; '),
          v.consigliati.map((c) => c.etichetta).join('; '),
          v.tariffario.join('; '),
        ]
          .map(esc)
          .join(','),
      ),
    ].join('\n');
    writeFileSync(csv, contenuto + '\n', 'utf-8');
    console.log(`\nElenco completo scritto in ${csv} (${daLavorare.length} veicoli)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
