import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BolloService, CacheTariffari } from '../bollo/bollo.service';
import { Periodicita } from '../bollo/motore';
import { CAMPI_CALCOLO } from '../veicoli/domini';
import { CampoDaCompletare, classificaValutazione } from './classifica';
import { DOVE_TROVARLO } from './dove-trovarlo';
import { etichetta } from '../bollo/motore';

export type FiltroStato = 'DA_COMPLETARE' | 'CONSIGLIATI' | 'TUTTI';

export interface ValutazioneVeicolo {
  idVeicolo: number;
  targa: string;
  idCliente: number;
  cliente: string;
  tipoVeicolo: string | null;
  periodicita: Periodicita;
  esito: 'CALCOLATO' | 'ESENTE' | 'NON_CALCOLABILE';
  importo: number | null;
  mancanti: CampoDaCompletare[];
  consigliati: CampoDaCompletare[];
  tariffario: string[];
  /** Valori attuali dei campi di calcolo, per precompilare il modulo */
  valori: Record<string, string | number | null>;
  /** Scadenze da pagare senza importo negli anni con tariffario */
  scadenzeSenzaImporto: number;
}

export interface VoceConteggio {
  chiave: string;
  etichetta: string;
  doveTrovarlo: string | null;
  veicoli: number;
}

export interface RapportoCompletezza {
  anno: number;
  totale: number;
  calcolabili: number;
  nonCalcolabili: number;
  perCampo: VoceConteggio[];
  perConsigliato: VoceConteggio[];
  problemiTariffario: Array<{ messaggio: string; veicoli: number }>;
  scadenzeSenzaImporto: number;
  /** Anni coperti da un tariffario: gli altri restano senza importo */
  anniConTariffario: number[];
}

export interface FiltriCompletezza {
  stato?: FiltroStato;
  campo?: string;
  cerca?: string;
  idCliente?: number;
  periodicita?: Periodicita;
  pagina?: number;
  perPagina?: number;
}

const INCLUDE_VEICOLO = {
  cliente: { select: { id: true, ragioneSociale: true, nome: true, cognome: true } },
  // La periodicità con cui il veicolo paga è quella della scadenza più recente.
  scadenze: {
    select: { periodicita: true },
    orderBy: { dataScadenza: 'desc' as const },
    take: 1,
  },
} satisfies Prisma.VeicoloInclude;

type VeicoloCaricato = Prisma.VeicoloGetPayload<{ include: typeof INCLUDE_VEICOLO }>;

function nomeCliente(c: { ragioneSociale: string | null; nome: string | null; cognome: string | null }): string {
  return c.ragioneSociale?.trim() || [c.nome, c.cognome].filter(Boolean).join(' ').trim() || '(senza nome)';
}

function conta(mappa: Map<string, number>, chiave: string) {
  mappa.set(chiave, (mappa.get(chiave) ?? 0) + 1);
}

function ordinaConteggi(mappa: Map<string, number>): VoceConteggio[] {
  return [...mappa.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([chiave, veicoli]) => ({
      chiave,
      etichetta: etichetta(chiave),
      doveTrovarlo: DOVE_TROVARLO[chiave] ?? null,
      veicoli,
    }));
}

/**
 * Completezza dei dati dei veicoli: quali impediscono il calcolo del bollo,
 * e cosa manca a ciascuno.
 *
 * È la lista di lavoro della bonifica dei dati importati dall'archivio, e la
 * sua misura di avanzamento. Esegue il motore di calcolo su ogni veicolo
 * attivo: i dati richiesti non sono elencati qui, li dice il motore.
 */
@Injectable()
export class CompletezzaService {
  constructor(
    private prisma: PrismaService,
    private bollo: BolloService,
  ) {}

  /** Rapporto complessivo e righe filtrate e paginate. */
  async elenco(filtri: FiltriCompletezza = {}, anno = new Date().getFullYear()) {
    const valutazioni = await this.valutaTutti(anno);
    const rapporto = this.riassumi(valutazioni, anno, await this.anniConTariffario());

    const stato = filtri.stato ?? 'DA_COMPLETARE';
    const cerca = filtri.cerca?.trim().toLowerCase();
    const righe = valutazioni.filter((v) => {
      if (stato === 'DA_COMPLETARE' && v.esito !== 'NON_CALCOLABILE') return false;
      if (stato === 'CONSIGLIATI' && (v.esito === 'NON_CALCOLABILE' || v.consigliati.length === 0)) return false;
      if (filtri.campo && ![...v.mancanti, ...v.consigliati].some((c) => c.campo === filtri.campo)) return false;
      if (filtri.idCliente !== undefined && v.idCliente !== filtri.idCliente) return false;
      if (filtri.periodicita && v.periodicita !== filtri.periodicita) return false;
      if (cerca && !v.targa.toLowerCase().includes(cerca) && !v.cliente.toLowerCase().includes(cerca)) {
        return false;
      }
      return true;
    });

    const perPagina = Math.min(Math.max(filtri.perPagina ?? 50, 1), 5000);
    const pagine = Math.max(1, Math.ceil(righe.length / perPagina));
    const pagina = Math.min(Math.max(filtri.pagina ?? 1, 1), pagine);

    return {
      rapporto,
      righe: righe.slice((pagina - 1) * perPagina, pagina * perPagina),
      totaleRighe: righe.length,
      pagina,
      pagine,
      perPagina,
    };
  }

  /** Valutazione di un solo veicolo, anche disattivato. */
  async veicolo(idVeicolo: number, anno = new Date().getFullYear()): Promise<ValutazioneVeicolo> {
    const veicolo = await this.prisma.veicolo.findUnique({
      where: { id: idVeicolo },
      include: INCLUDE_VEICOLO,
    });
    if (!veicolo) {
      throw new NotFoundException(`Veicolo con ID ${idVeicolo} non trovato`);
    }
    const senzaImporto = await this.scadenzeSenzaImporto([idVeicolo]);
    return this.valuta(veicolo, anno, new Map(), senzaImporto.get(idVeicolo) ?? 0);
  }

  private async valutaTutti(anno: number): Promise<ValutazioneVeicolo[]> {
    const veicoli = await this.prisma.veicolo.findMany({
      where: { attivo: true, cliente: { attivo: true } },
      include: INCLUDE_VEICOLO,
      orderBy: { targa: 'asc' },
    });
    const senzaImporto = await this.scadenzeSenzaImporto();
    const cache: CacheTariffari = new Map();
    const valutazioni: ValutazioneVeicolo[] = [];
    for (const v of veicoli) {
      valutazioni.push(await this.valuta(v, anno, cache, senzaImporto.get(v.id) ?? 0));
    }
    return valutazioni;
  }

  /** Anni, da quello corrente in poi, con almeno un tariffario attivo. */
  private async anniConTariffario(): Promise<number[]> {
    return (
      await this.prisma.configurazioneBollo.findMany({
        where: { attivo: true, annoValidita: { gte: new Date().getFullYear() } },
        select: { annoValidita: true },
        distinct: ['annoValidita'],
        orderBy: { annoValidita: 'asc' },
      })
    ).map((c) => c.annoValidita);
  }

  /**
   * Scadenze da pagare senza importo, per veicolo, negli anni che hanno un
   * tariffario configurato: sono quelle che completare i dati sistema.
   * L'archivio contiene scadenze fino al 2050; per gli anni senza tariffario
   * l'importo manca comunque, e contarle renderebbe la misura irraggiungibile.
   */
  private async scadenzeSenzaImporto(idVeicoli?: number[]): Promise<Map<number, number>> {
    const anni = await this.anniConTariffario();
    if (anni.length === 0) return new Map();

    const righe = await this.prisma.scadenza.groupBy({
      by: ['idVeicolo'],
      where: {
        stato: 'DA_PAGARE',
        annoScadenza: { in: anni },
        importoPrevisto: null,
        ...(idVeicoli ? { idVeicolo: { in: idVeicoli } } : {}),
      },
      _count: { _all: true },
    });
    return new Map(righe.map((r) => [r.idVeicolo, r._count._all]));
  }

  private async valuta(
    veicolo: VeicoloCaricato,
    anno: number,
    cache: CacheTariffari,
    scadenzeSenzaImporto: number,
  ): Promise<ValutazioneVeicolo> {
    const periodicita = (veicolo.scadenze[0]?.periodicita ?? 'ANNUALE') as Periodicita;
    const calcolo = await this.bollo.valutaVeicolo(veicolo, anno, periodicita, cache);
    const { mancanti, consigliati, tariffario } = classificaValutazione(calcolo);

    const valori: Record<string, string | number | null> = {};
    for (const c of CAMPI_CALCOLO) {
      const valore = (veicolo as Record<string, unknown>)[c];
      valori[c] =
        valore === null || valore === undefined
          ? null
          : valore instanceof Date
            ? valore.toISOString().slice(0, 10)
            : typeof valore === 'number' || typeof valore === 'string'
              ? valore
              : String(valore); // Decimal
    }

    return {
      idVeicolo: veicolo.id,
      targa: veicolo.targa,
      idCliente: veicolo.cliente.id,
      cliente: nomeCliente(veicolo.cliente),
      tipoVeicolo: veicolo.tipoVeicolo,
      periodicita,
      esito: calcolo.esito,
      importo: calcolo.importoBase,
      mancanti,
      consigliati,
      tariffario,
      valori,
      scadenzeSenzaImporto,
    };
  }

  private riassumi(
    valutazioni: ValutazioneVeicolo[],
    anno: number,
    anniConTariffario: number[],
  ): RapportoCompletezza {
    const perCampo = new Map<string, number>();
    const perConsigliato = new Map<string, number>();
    const tariffario = new Map<string, number>();
    let calcolabili = 0;
    let scadenzeSenzaImporto = 0;

    for (const v of valutazioni) {
      if (v.esito !== 'NON_CALCOLABILE') calcolabili++;
      scadenzeSenzaImporto += v.scadenzeSenzaImporto;
      for (const c of v.mancanti) conta(perCampo, c.campo);
      for (const c of v.consigliati) conta(perConsigliato, c.campo);
      for (const t of v.tariffario) conta(tariffario, t);
    }

    return {
      anno,
      totale: valutazioni.length,
      calcolabili,
      nonCalcolabili: valutazioni.length - calcolabili,
      perCampo: ordinaConteggi(perCampo),
      perConsigliato: ordinaConteggi(perConsigliato),
      problemiTariffario: [...tariffario.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([messaggio, veicoli]) => ({ messaggio, veicoli })),
      scadenzeSenzaImporto,
      anniConTariffario,
    };
  }
}
