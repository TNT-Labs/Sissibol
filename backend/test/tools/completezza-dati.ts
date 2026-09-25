/**
 * Rapporto sulla completezza dei dati dei veicoli.
 *
 * Elenca, veicolo per veicolo, cosa impedisce di calcolare il bollo e dove
 * trovare il dato mancante. È l'elenco di lavoro della bonifica: senza questi
 * dati anche un motore di calcolo corretto non può produrre un importo.
 *
 * I dati richiesti NON sono elencati qui a mano: il rapporto esegue il motore
 * di calcolo su ogni veicolo e ne raccoglie i motivi di non calcolabilità.
 * Un elenco parallelo diverge alla prima modifica delle regole (la versione
 * precedente di questo strumento non chiedeva, per esempio, assi e
 * sospensioni degli autocarri pesanti).
 *
 * Uso:
 *   DATABASE_URL=... npx ts-node test/tools/completezza-dati.ts [--anno 2026] [--csv percorso.csv]
 */

import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { BolloService } from '../../src/bollo/bollo.service';
import { AuditService } from '../../src/audit/audit.service';
import { etichetta } from '../../src/bollo/motore';

const prisma = new PrismaClient();

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
  massaRimorchiabileKg: 'Carta di circolazione, riquadro O.1 (massa rimorchiabile)',
  regione: 'Residenza o sede del proprietario',
  alimentazione: 'Carta di circolazione, riquadro P.3 (tipo di alimentazione)',
  dataImmatricolazione: 'Carta di circolazione, riquadro B (prima immatricolazione)',
};

/** Motivi che dipendono dal tariffario, non dai dati del veicolo. */
const MOTIVI_TARIFFARIO = new Set([
  'TARIFFA_MANCANTE',
  'TARIFFA_AMBIGUA',
  'FUORI_FASCIA',
  'PERIODICITA_NON_PREVISTA',
  'TARIFFARIO_ASSENTE',
]);

interface RigaVeicolo {
  targa: string;
  cliente: string;
  tipoVeicolo: string | null;
  /** Dati indispensabili al calcolo */
  mancanti: string[];
  /** Dati che servono a valutare esenzioni e riduzioni */
  consigliati: string[];
  /** Problemi del tariffario che bloccano il calcolo */
  tariffario: string[];
}

function nomeCliente(c: { ragioneSociale: string | null; nome: string | null; cognome: string | null }): string {
  return c.ragioneSociale || [c.nome, c.cognome].filter(Boolean).join(' ') || '(senza nome)';
}

function argomento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const anno = Number(argomento('--anno') ?? new Date().getFullYear());
  const bollo = new BolloService(prisma as never, new AuditService(prisma as never));

  const veicoli = await prisma.veicolo.findMany({
    where: { attivo: true, cliente: { attivo: true } },
    include: { cliente: { select: { ragioneSociale: true, nome: true, cognome: true } } },
    orderBy: { targa: 'asc' },
  });

  const cache = new Map();
  const righe: RigaVeicolo[] = [];
  const contaMancanti = new Map<string, number>();
  const contaConsigliati = new Map<string, number>();
  const contaTariffario = new Map<string, number>();
  let calcolabili = 0;

  for (const v of veicoli) {
    const r = await bollo.calcolaBollo(v.id, anno, 'ANNUALE', cache);

    const mancanti = r.motivi
      .filter((m) => !MOTIVI_TARIFFARIO.has(m.codice) && m.campo)
      .map((m) => (m.codice === 'TIPO_NON_GESTITO' ? `tipoVeicolo (da riclassificare: ${v.tipoVeicolo})` : m.campo!));
    const tariffario = r.motivi.filter((m) => MOTIVI_TARIFFARIO.has(m.codice)).map((m) => m.messaggio);
    const consigliati = [
      ...(r.assunzioni.some((a) => a.startsWith('Alimentazione')) ? ['alimentazione'] : []),
      ...(r.assunzioni.some((a) => a.startsWith('Data di immatricolazione')) ? ['dataImmatricolazione'] : []),
    ];

    if (r.esito !== 'NON_CALCOLABILE') calcolabili++;
    for (const m of mancanti) contaMancanti.set(m, (contaMancanti.get(m) ?? 0) + 1);
    for (const c of consigliati) contaConsigliati.set(c, (contaConsigliati.get(c) ?? 0) + 1);
    for (const t of tariffario) contaTariffario.set(t, (contaTariffario.get(t) ?? 0) + 1);

    if (mancanti.length || consigliati.length || tariffario.length) {
      righe.push({ targa: v.targa, cliente: nomeCliente(v.cliente), tipoVeicolo: v.tipoVeicolo, mancanti, consigliati, tariffario });
    }
  }

  const totale = veicoli.length;
  const pct = (n: number) => `${((n / Math.max(totale, 1)) * 100).toFixed(1)}%`;
  const ordina = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`=== COMPLETEZZA DATI VEICOLI (tariffario ${anno}) ===\n`);
  console.log(`  veicoli attivi:                ${totale}`);
  console.log(`  bollo calcolabile:             ${calcolabili} (${pct(calcolabili)})`);
  console.log(`  bollo non calcolabile:         ${totale - calcolabili} (${pct(totale - calcolabili)})`);

  console.log('\n=== DATI INDISPENSABILI MANCANTI (un veicolo può averne più di uno) ===');
  for (const [campo, n] of ordina(contaMancanti)) {
    const chiave = campo.split(' ')[0];
    console.log(`  ${String(n).padStart(5)}x  ${etichetta(chiave).padEnd(24)} ${DOVE_TROVARLO[chiave] ?? ''}${campo.includes('(') ? `  ${campo.slice(campo.indexOf('('))}` : ''}`);
  }
  console.log('\n  Nota: si vede solo il primo blocco di ogni veicolo. Chi non ha il tipo, per');
  console.log('  esempio, avrà quasi certamente bisogno anche di potenza o peso una volta indicato.');

  if (contaTariffario.size) {
    console.log('\n=== PROBLEMI DEL TARIFFARIO (da correggere nella pagina Tariffe) ===');
    for (const [messaggio, n] of ordina(contaTariffario)) console.log(`  ${String(n).padStart(5)}x  ${messaggio}`);
  }

  if (contaConsigliati.size) {
    console.log('\n=== DATI CONSIGLIATI (esenzioni e riduzioni non valutate senza di essi) ===');
    for (const [campo, n] of ordina(contaConsigliati)) {
      console.log(`  ${String(n).padStart(5)}x  ${etichetta(campo).padEnd(24)} ${DOVE_TROVARLO[campo] ?? ''}`);
    }
  }

  const csv = argomento('--csv');
  if (csv) {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const contenuto = [
      'Targa,Cliente,TipoVeicolo,DatiMancanti,DoveTrovarli,DatiConsigliati,ProblemiTariffario',
      ...righe.map((r) =>
        [
          r.targa,
          r.cliente,
          r.tipoVeicolo ?? '',
          r.mancanti.map((m) => etichetta(m.split(' ')[0])).join('; '),
          r.mancanti.map((m) => DOVE_TROVARLO[m.split(' ')[0]]).filter(Boolean).join('; '),
          r.consigliati.map((c) => etichetta(c)).join('; '),
          r.tariffario.join('; '),
        ]
          .map(esc)
          .join(','),
      ),
    ].join('\n');
    writeFileSync(csv, contenuto + '\n', 'utf-8');
    console.log(`\nElenco completo scritto in ${csv} (${righe.length} veicoli)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
