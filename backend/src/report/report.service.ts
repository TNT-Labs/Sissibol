import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DefinizioneReport } from './formati';

/** Righe lette dal database per ogni blocco. */
const BLOCCO = 2000;

const ETICHETTA_STATO: Record<string, string> = {
  DA_PAGARE: 'Da pagare',
  SCADUTO: 'Scaduto',
  PAGATO: 'Pagato',
};

const DATA_BREVE = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const MESE_ANNO = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export interface FiltriScadenze {
  stato?: 'DA_PAGARE' | 'PAGATO' | 'SCADUTO';
  idCliente?: number;
  /** Primo mese incluso (UTC, giorno 1). */
  da: Date;
  /** Ultimo mese incluso (UTC, giorno 1). */
  a: Date;
}

export interface FiltriPagamenti {
  dal?: Date;
  al?: Date;
}

/**
 * Lettura a blocchi con cursore: ogni blocco riparte dall'ultimo id letto,
 * quindi la memoria usata non cresce con il numero di righe.
 */
async function* aBlocchi<T extends { id: number }>(leggi: (cursore?: number) => Promise<T[]>): AsyncGenerator<T> {
  let cursore: number | undefined;
  for (;;) {
    const blocco = await leggi(cursore);
    for (const riga of blocco) yield riga;
    if (blocco.length < BLOCCO) return;
    cursore = blocco[blocco.length - 1].id;
  }
}

async function* tutte<T>(leggi: () => Promise<T[]>): AsyncGenerator<T> {
  yield* await leggi();
}

const cursoreArgs = (cursore?: number): { take: number; skip?: number; cursor?: { id: number } } =>
  cursore === undefined ? { take: BLOCCO } : { take: BLOCCO, skip: 1, cursor: { id: cursore } };

const selezioneCliente = { select: { tipoCliente: true, ragioneSociale: true, nome: true, cognome: true } } as const;

type NomiCliente = { tipoCliente: string; ragioneSociale: string | null; nome: string | null; cognome: string | null };

/**
 * Nome del cliente come nell'interfaccia (getClienteDisplayName): "Cognome
 * Nome" per le persone fisiche, così gli elenchi si ordinano per cognome.
 */
export function nomeCliente(c: NomiCliente): string {
  const persona = `${c.cognome ?? ''} ${c.nome ?? ''}`.trim();
  const nome = c.tipoCliente === 'PERSONA_FISICA' ? persona || c.ragioneSociale : c.ragioneSociale || persona;
  return nome?.trim() || 'N/A';
}

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Scadenze
  // -------------------------------------------------------------------------

  private whereScadenze(f: FiltriScadenze): Prisma.ScadenzaWhereInput {
    // Fine esclusa: primo giorno del mese successivo a `a`.
    const fine = new Date(Date.UTC(f.a.getUTCFullYear(), f.a.getUTCMonth() + 1, 1));
    return {
      dataScadenza: { gte: f.da, lt: fine },
      ...(f.stato ? { stato: f.stato } : {}),
      veicolo: {
        attivo: true,
        cliente: { attivo: true },
        ...(f.idCliente ? { idCliente: f.idCliente } : {}),
      },
    };
  }

  contaScadenze(f: FiltriScadenze) {
    return this.prisma.scadenza.count({ where: this.whereScadenze(f) });
  }

  async scadenze(f: FiltriScadenze): Promise<DefinizioneReport<RigaScadenza>> {
    const where = this.whereScadenze(f);
    const filtri = [`Periodo: da ${MESE_ANNO.format(f.da)} a ${MESE_ANNO.format(f.a)}`];
    if (f.stato) filtri.push(`Stato: ${ETICHETTA_STATO[f.stato]}`);
    if (f.idCliente) filtri.push(`Cliente: ${await this.nomeDelCliente(f.idCliente)}`);

    return {
      titolo: 'Report scadenze bolli',
      foglio: 'Scadenze',
      filtri,
      colonne: [
        { titolo: 'Scadenza', tipo: 'mese', larghezza: 11, pdf: 11, valore: (s) => s.dataScadenza },
        { titolo: 'Cliente', larghezza: 34, pdf: 34, valore: (s) => nomeCliente(s.veicolo.cliente) },
        { titolo: 'Targa', larghezza: 12, pdf: 12, valore: (s) => s.veicolo.targa },
        { titolo: 'Tipo veicolo', larghezza: 22, valore: (s) => s.veicolo.tipoVeicolo },
        { titolo: 'Periodicità', larghezza: 15, valore: (s) => (s.periodicita === 'QUADRIMESTRALE' ? 'Quadrimestrale' : 'Annuale') },
        { titolo: 'Importo previsto', tipo: 'euro', totale: true, larghezza: 16, pdf: 15, valore: (s) => s.importoPrevisto?.toString() },
        { titolo: 'Stato', larghezza: 12, pdf: 11, valore: (s) => ETICHETTA_STATO[s.stato] ?? s.stato },
      ],
      righe: aBlocchi((cursore) =>
        this.prisma.scadenza.findMany({
          where,
          select: {
            id: true,
            dataScadenza: true,
            periodicita: true,
            importoPrevisto: true,
            stato: true,
            veicolo: { select: { targa: true, tipoVeicolo: true, cliente: selezioneCliente } },
          },
          orderBy: [{ dataScadenza: 'asc' }, { id: 'asc' }],
          ...cursoreArgs(cursore),
        }),
      ),
    };
  }

  // -------------------------------------------------------------------------
  // Pagamenti
  // -------------------------------------------------------------------------

  private wherePagamenti(f: FiltriPagamenti): Prisma.PagamentoWhereInput {
    if (!f.dal && !f.al) return {};
    return { dataPagamento: { ...(f.dal ? { gte: f.dal } : {}), ...(f.al ? { lte: f.al } : {}) } };
  }

  contaPagamenti(f: FiltriPagamenti) {
    return this.prisma.pagamento.count({ where: this.wherePagamenti(f) });
  }

  pagamenti(f: FiltriPagamenti): DefinizioneReport<RigaPagamento> {
    const where = this.wherePagamenti(f);
    const filtri: string[] = [];
    if (f.dal || f.al) {
      filtri.push(
        `Periodo: ${f.dal ? `dal ${DATA_BREVE.format(f.dal)}` : ''}${f.dal && f.al ? ' ' : ''}${f.al ? `al ${DATA_BREVE.format(f.al)}` : ''}`,
      );
    } else {
      filtri.push('Periodo: tutti i pagamenti');
    }

    return {
      titolo: 'Report pagamenti',
      foglio: 'Pagamenti',
      filtri,
      colonne: [
        { titolo: 'Data pagamento', tipo: 'data', larghezza: 15, pdf: 13, valore: (p) => p.dataPagamento },
        { titolo: 'Cliente', larghezza: 34, pdf: 32, valore: (p) => nomeCliente(p.scadenza.veicolo.cliente) },
        { titolo: 'Targa', larghezza: 12, pdf: 11, valore: (p) => p.scadenza.veicolo.targa },
        { titolo: 'Scadenza', tipo: 'mese', larghezza: 11, pdf: 10, valore: (p) => p.scadenza.dataScadenza },
        { titolo: 'Importo pagato', tipo: 'euro', totale: true, larghezza: 16, pdf: 14, valore: (p) => p.importoPagato.toString() },
        { titolo: 'Metodo', larghezza: 18, pdf: 13, valore: (p) => p.metodoPagamento },
      ],
      righe: aBlocchi((cursore) =>
        this.prisma.pagamento.findMany({
          where,
          select: {
            id: true,
            dataPagamento: true,
            importoPagato: true,
            metodoPagamento: true,
            scadenza: {
              select: { dataScadenza: true, veicolo: { select: { targa: true, cliente: selezioneCliente } } },
            },
          },
          orderBy: [{ dataPagamento: 'asc' }, { id: 'asc' }],
          ...cursoreArgs(cursore),
        }),
      ),
    };
  }

  // -------------------------------------------------------------------------
  // Clienti
  // -------------------------------------------------------------------------

  contaClienti() {
    return this.prisma.cliente.count({ where: { attivo: true } });
  }

  clienti(): DefinizioneReport<RigaCliente> {
    return {
      titolo: 'Report clienti',
      foglio: 'Clienti',
      filtri: ['Clienti attivi'],
      colonne: [
        { titolo: 'Cliente', larghezza: 34, pdf: 30, valore: (c) => nomeCliente(c) },
        { titolo: 'P.IVA / C.F.', larghezza: 18, pdf: 16, valore: (c) => c.partitaIva || c.codiceFiscale },
        { titolo: 'Email', larghezza: 30, pdf: 26, valore: (c) => c.email },
        { titolo: 'Telefono', larghezza: 16, pdf: 13, valore: (c) => c.telefono },
        { titolo: 'Indirizzo', larghezza: 36, valore: (c) => c.indirizzo },
        { titolo: 'Veicoli attivi', larghezza: 13, pdf: 8, valore: (c) => c._count.veicoli },
        { titolo: 'Avvisi email', larghezza: 13, valore: (c) => (c.avvisiEmail ? 'Sì' : 'No') },
      ],
      // I clienti sono poche centinaia: una sola lettura, in ordine alfabetico
      // del nome mostrato (ragione sociale o nome e cognome).
      righe: tutte(async () =>
        (await this.prisma.cliente.findMany({
          where: { attivo: true },
          select: {
            id: true,
            tipoCliente: true,
            ragioneSociale: true,
            nome: true,
            cognome: true,
            partitaIva: true,
            codiceFiscale: true,
            email: true,
            telefono: true,
            indirizzo: true,
            avvisiEmail: true,
            _count: { select: { veicoli: { where: { attivo: true } } } },
          },
        })).sort((x, y) => nomeCliente(x).localeCompare(nomeCliente(y), 'it', { sensitivity: 'base' })),
      ),
    };
  }

  private async nomeDelCliente(id: number): Promise<string> {
    const cliente = await this.prisma.cliente.findUnique({ where: { id }, select: selezioneCliente.select });
    return cliente ? nomeCliente(cliente) : `#${id}`;
  }
}

export interface RigaScadenza {
  id: number;
  dataScadenza: Date;
  periodicita: string;
  importoPrevisto: Prisma.Decimal | null;
  stato: string;
  veicolo: { targa: string; tipoVeicolo: string | null; cliente: NomiCliente };
}

export interface RigaPagamento {
  id: number;
  dataPagamento: Date;
  importoPagato: Prisma.Decimal;
  metodoPagamento: string | null;
  scadenza: {
    dataScadenza: Date;
    veicolo: { targa: string; cliente: NomiCliente };
  };
}

export interface RigaCliente {
  id: number;
  tipoCliente: string;
  ragioneSociale: string | null;
  nome: string | null;
  cognome: string | null;
  partitaIva: string | null;
  codiceFiscale: string | null;
  email: string | null;
  telefono: string | null;
  indirizzo: string | null;
  avvisiEmail: boolean;
  _count: { veicoli: number };
}
