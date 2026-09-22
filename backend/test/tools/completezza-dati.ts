/**
 * Rapporto sulla completezza dei dati dei veicoli.
 *
 * Il motore di calcolo non può produrre un importo se mancano i dati tecnici
 * del veicolo, e oggi restituisce zero invece di dirlo. Questo strumento
 * elenca, per ciascun veicolo, quali campi mancano e quale documento serve per
 * recuperarli: è l'elenco di lavoro della bonifica dati, senza la quale anche
 * un motore di calcolo corretto continuerebbe a restituire zero.
 *
 * Uso:
 *   DATABASE_URL=... npx ts-node test/tools/completezza-dati.ts [--csv percorso.csv]
 */

import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';

const prisma = new PrismaClient();

/**
 * Campi indispensabili al calcolo, per tipo veicolo.
 * Ricalca i rami di `BolloService.calcolaImportoPerTipo`.
 */
const CAMPI_RICHIESTI: Record<string, string[]> = {
  Autovettura: ['potenzaKw', 'classeAmbientale'],
  'Autoveicolo uso promiscuo': ['potenzaKw', 'classeAmbientale'],
  Motociclo: ['potenzaKw', 'classeAmbientale'],
  Autocarro: ['pesoComplessivoKg'],
  Autotreno: ['pesoComplessivoKg'],
  Autoarticolato: ['pesoComplessivoKg'],
  'Trattore stradale': ['pesoComplessivoKg'],
  Autobus: ['potenzaKw'],
  'Autoveicolo speciale': ['potenzaKw'],
  Autocaravan: ['potenzaKw'],
  Motocarro: ['cilindrata'],
  Motofurgone: ['cilindrata'],
  Rimorchio: ['pesoComplessivoKg'],
  'Rimorchio speciale': ['pesoComplessivoKg'],
  Semirimorchio: ['pesoComplessivoKg'],
  'Rimorchio trasporto persone': ['numeroPosti'],
};

/** Dove l'operatore trova il dato mancante. */
const DOVE_TROVARLO: Record<string, string> = {
  tipoVeicolo: 'Carta di circolazione, riquadro J (categoria del veicolo)',
  potenzaKw: 'Carta di circolazione, riquadro P.2 (potenza netta massima)',
  classeAmbientale: 'Carta di circolazione, riquadro V.9 (classe ambientale)',
  cilindrata: 'Carta di circolazione, riquadro P.1 (cilindrata)',
  portataKg: 'Carta di circolazione, differenza fra F.2 e G',
  pesoComplessivoKg: 'Carta di circolazione, riquadro F.2 (massa massima ammissibile)',
  numeroAssi: 'Carta di circolazione, riquadro L (numero di assi)',
  tipoSospensione: 'Carta di circolazione, annotazioni (sospensioni pneumatiche)',
  numeroPosti: 'Carta di circolazione, riquadro S.1 (numero di posti)',
  regione: 'Residenza o sede del proprietario',
};

interface RigaMancanze {
  targa: string;
  cliente: string;
  tipoVeicolo: string | null;
  mancanti: string[];
}

function nomeCliente(c: {
  ragioneSociale: string | null;
  nome: string | null;
  cognome: string | null;
}): string {
  return (
    c.ragioneSociale ?? [c.nome, c.cognome].filter(Boolean).join(' ') ?? '(senza nome)'
  );
}

async function main() {
  const veicoli = await prisma.veicolo.findMany({
    where: { attivo: true, cliente: { attivo: true } },
    include: {
      cliente: { select: { ragioneSociale: true, nome: true, cognome: true } },
    },
    orderBy: { targa: 'asc' },
  });

  const righe: RigaMancanze[] = [];
  const conteggioCampi = new Map<string, number>();
  const conteggioTipi = new Map<string, number>();
  let completi = 0;

  for (const v of veicoli) {
    const mancanti: string[] = [];

    if (!v.tipoVeicolo) {
      mancanti.push('tipoVeicolo');
    }
    if (!v.regione) {
      mancanti.push('regione');
    }

    // Senza il tipo non si sa nemmeno quali altri campi servano.
    const richiesti = v.tipoVeicolo ? CAMPI_RICHIESTI[v.tipoVeicolo] : undefined;
    if (richiesti) {
      for (const campo of richiesti) {
        if (v[campo as keyof typeof v] === null || v[campo as keyof typeof v] === undefined) {
          mancanti.push(campo);
        }
      }
    } else if (v.tipoVeicolo) {
      // Tipo presente ma senza tariffa: 'Motrice' e 'Altro' prodotti
      // dall'import, che nessun ramo del motore sa calcolare.
      mancanti.push(`tipoVeicolo non tariffato (${v.tipoVeicolo})`);
    }

    const tipo = v.tipoVeicolo ?? '(non specificato)';
    conteggioTipi.set(tipo, (conteggioTipi.get(tipo) ?? 0) + 1);

    if (mancanti.length === 0) {
      completi++;
      continue;
    }

    for (const m of mancanti) {
      conteggioCampi.set(m, (conteggioCampi.get(m) ?? 0) + 1);
    }

    righe.push({
      targa: v.targa,
      cliente: nomeCliente(v.cliente),
      tipoVeicolo: v.tipoVeicolo,
      mancanti,
    });
  }

  stampaRapporto(veicoli.length, completi, righe, conteggioCampi, conteggioTipi);

  const indiceCsv = process.argv.indexOf('--csv');
  if (indiceCsv >= 0 && process.argv[indiceCsv + 1]) {
    scriviCsv(process.argv[indiceCsv + 1], righe);
  }
}

function stampaRapporto(
  totale: number,
  completi: number,
  righe: RigaMancanze[],
  conteggioCampi: Map<string, number>,
  conteggioTipi: Map<string, number>,
) {
  const pct = (n: number) => `${((n / totale) * 100).toFixed(1)}%`;

  console.log('=== COMPLETEZZA DATI VEICOLI ===\n');
  console.log(`  veicoli attivi:                ${totale}`);
  console.log(`  calcolabili (dati completi):   ${completi} (${pct(completi)})`);
  console.log(`  con almeno un dato mancante:   ${righe.length} (${pct(righe.length)})`);

  console.log('\n=== CAMPI MANCANTI, PER FREQUENZA ===');
  for (const [campo, n] of [...conteggioCampi.entries()].sort((a, b) => b[1] - a[1])) {
    const dove = DOVE_TROVARLO[campo];
    console.log(`  ${String(n).padStart(5)}x  ${campo.padEnd(34)} ${dove ?? ''}`);
  }

  console.log('\n=== RIPARTIZIONE PER TIPO VEICOLO ===');
  for (const [tipo, n] of [...conteggioTipi.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}x  ${tipo}`);
  }

  console.log('\n=== PRIMI VEICOLI DA COMPLETARE ===');
  for (const r of righe.slice(0, 15)) {
    console.log(
      `  ${r.targa.padEnd(10)} ${r.cliente.slice(0, 28).padEnd(30)} ${r.mancanti.join(', ')}`,
    );
  }
  if (righe.length > 15) {
    console.log(`  ... e altri ${righe.length - 15}. Usare --csv per l'elenco completo.`);
  }
}

function scriviCsv(percorso: string, righe: RigaMancanze[]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const contenuto = [
    'Targa,Cliente,TipoVeicolo,CampiMancanti,DoveTrovarli',
    ...righe.map((r) =>
      [
        escape(r.targa),
        escape(r.cliente),
        escape(r.tipoVeicolo ?? ''),
        escape(r.mancanti.join('; ')),
        escape(r.mancanti.map((m) => DOVE_TROVARLO[m]).filter(Boolean).join('; ')),
      ].join(','),
    ),
  ].join('\n');

  writeFileSync(percorso, contenuto + '\n', 'utf-8');
  console.log(`\nElenco completo scritto in ${percorso} (${righe.length} veicoli)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
