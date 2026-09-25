import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CodiceMotivo,
  EsitoCalcolo,
  MotivoNonCalcolabile,
  Periodicita,
  RisultatoCalcolo,
  TariffarioInput,
  VeicoloInput,
  calcolaBollo as calcolaConMotore,
  datoMancante,
  risultatoNonCalcolabile,
} from './motore';

/**
 * Risultato del calcolo esposto dall'API e usato dagli altri servizi.
 *
 * Conserva la forma della versione precedente (importoBase, tariffeApplicate,
 * dettaglioCalcolo...) per non rompere i consumatori, con una differenza
 * sostanziale: quando il calcolo non è possibile `importoBase` è null, non
 * zero. Uno zero era indistinguibile da un veicolo esente e finiva salvato
 * come importo previsto delle scadenze.
 */
export interface CalcolobolloResult {
  esito: EsitoCalcolo;
  /** Importo dovuto; 0 se esente, null se non calcolabile */
  importoBase: number | null;
  /** Importo prima delle riduzioni parziali */
  importoLordo: number | null;
  /** Importo con sconto per domiciliazione bancaria */
  importoRidotto: number | null;
  scontoRid: number;
  tariffeApplicate: TariffaApplicata[];
  esenzioni: EsenzioneApplicata[];
  /** Perché il calcolo non è stato possibile */
  motivi: MotivoNonCalcolabile[];
  /** Benefici non valutati per dati mancanti */
  assunzioni: string[];
  note: string[];
  dettaglioCalcolo: string;
  versioneMotore: string;
  /** Tariffario effettivamente usato (anche quando è quello DEFAULT) */
  idConfigurazione: number | null;
  regioneConfigurazione: string | null;
}

// Alias di tipo e non interfacce: finiscono nelle colonne JSON dello
// snapshot, e solo gli alias sono assegnabili ai tipi JSON di Prisma.
type TariffaApplicata = {
  descrizione: string;
  importo: number;
  unitaMisura: string;
  valore: number | null;
};

type EsenzioneApplicata = {
  tipo: string;
  descrizione: string;
  percentualeRiduzione: number | null;
};

export interface EsitoAggiornamentoImporti {
  aggiornate: number;
  /** Scadenze lasciate invariate perché il calcolo non è possibile */
  nonCalcolabili: number;
  motivi: string[];
}

export type CacheTariffari = Map<string, TariffarioInput | null>;

/** I campi del veicolo che il calcolo legge. */
export interface DatiVeicoloCalcolo {
  regione: string | null;
  tipoVeicolo: string | null;
  classeAmbientale: string | null;
  alimentazione: string | null;
  potenzaKw: { toString(): string } | null;
  cilindrata: number | null;
  portataKg: number | null;
  pesoComplessivoKg: number | null;
  numeroAssi: number | null;
  tipoSospensione: string | null;
  numeroPosti: number | null;
  massaRimorchiabileKg: number | null;
  dataImmatricolazione: Date | null;
}

function toNumber(valore: string | null): number | null {
  return valore === null ? null : Number(valore);
}

function toStringOrNull(valore: { toString(): string } | null | undefined): string | null {
  return valore === null || valore === undefined ? null : valore.toString();
}

/** Data locale del server in formato YYYY-MM-DD. */
function oggi(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const gg = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${gg}`;
}

/**
 * Adattatore fra il database e il motore di calcolo.
 *
 * Tutta la logica di calcolo vive in `./motore`, modulo puro e testato in
 * isolamento. Qui si caricano veicolo e tariffario, si convertono nei tipi
 * del motore e si riporta il risultato nella forma attesa dall'API.
 */
@Injectable()
export class BolloService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /**
   * Tariffario per anno e regione, con ripiego sulla configurazione DEFAULT.
   * La cache evita di ricaricarlo quando si calcolano molti veicoli di fila.
   */
  private async caricaTariffario(
    anno: number,
    regione: string,
    cache?: CacheTariffari,
  ): Promise<TariffarioInput | null> {
    const chiave = `${anno}:${regione}`;
    if (cache?.has(chiave)) return cache.get(chiave)!;

    const include = {
      tariffe: { orderBy: { id: 'asc' as const } },
      esenzioni: { orderBy: { id: 'asc' as const } },
    };

    const config =
      (await this.prisma.configurazioneBollo.findFirst({
        where: { annoValidita: anno, regione, attivo: true },
        include,
      })) ??
      (await this.prisma.configurazioneBollo.findFirst({
        where: { annoValidita: anno, regione: 'DEFAULT', attivo: true },
        include,
      }));

    const tariffario: TariffarioInput | null = config
      ? {
          id: config.id,
          anno: config.annoValidita,
          regione: config.regione,
          scontoRid: config.scontoRid.toString(),
          tariffe: config.tariffe.map((t) => ({
            id: t.id,
            tipoVeicolo: t.tipoVeicolo,
            categoriaEuro: t.categoriaEuro,
            unitaMisura: t.unitaMisura,
            sogliaMin: toStringOrNull(t.sogliaMin),
            sogliaMax: toStringOrNull(t.sogliaMax),
            importoUnitario: t.importoUnitario.toString(),
            importoFisso: toStringOrNull(t.importoFisso),
            tipoSospensione: t.tipoSospensione,
            periodicita: t.periodicita,
            descrizione: t.descrizione,
          })),
          esenzioni: config.esenzioni.map((e) => ({
            id: e.id,
            tipoEsenzione: e.tipoEsenzione as 'TOTALE' | 'PARZIALE',
            percentualeRiduzione: toStringOrNull(e.percentualeRiduzione),
            tipoVeicolo: e.tipoVeicolo,
            alimentazione: e.alimentazione,
            anniDaImmatricolazione: e.anniDaImmatricolazione,
            descrizione: e.descrizione,
          })),
        }
      : null;

    cache?.set(chiave, tariffario);
    return tariffario;
  }

  /**
   * Calcola il bollo di un veicolo.
   *
   * Solleva un'eccezione solo se il veicolo non esiste. Ogni altra
   * impossibilità (dati mancanti, regione senza tariffario, tariffe assenti)
   * è un esito NON_CALCOLABILE con i relativi motivi.
   */
  async calcolaBollo(
    idVeicolo: number,
    anno: number = new Date().getFullYear(),
    periodicita: Periodicita = 'ANNUALE',
    cache?: CacheTariffari,
  ): Promise<CalcolobolloResult> {
    const veicolo = await this.prisma.veicolo.findUnique({ where: { id: idVeicolo } });
    if (!veicolo) {
      throw new NotFoundException(`Veicolo con ID ${idVeicolo} non trovato`);
    }
    return this.valutaVeicolo(veicolo, anno, periodicita, cache);
  }

  /**
   * Calcola il bollo di un veicolo già caricato.
   *
   * Permette di valutare molti veicoli con una sola query (rapporto di
   * completezza) invece di rileggerli uno per uno.
   */
  async valutaVeicolo(
    veicolo: DatiVeicoloCalcolo,
    anno: number = new Date().getFullYear(),
    periodicita: Periodicita = 'ANNUALE',
    cache?: CacheTariffari,
  ): Promise<CalcolobolloResult> {
    // La regione sceglie il tariffario: senza, non c'è nulla su cui calcolare.
    // Il motore precedente assumeva la Lombardia.
    if (!veicolo.regione) {
      return this.adatta(risultatoNonCalcolabile([datoMancante('regione')]), null);
    }

    const tariffario = await this.caricaTariffario(anno, veicolo.regione, cache);
    if (!tariffario) {
      return this.adatta(
        risultatoNonCalcolabile([
          {
            codice: 'TARIFFARIO_ASSENTE' as CodiceMotivo,
            campo: 'regione',
            messaggio: `Nessun tariffario configurato per ${veicolo.regione} ${anno}, né un tariffario DEFAULT per lo stesso anno.`,
          },
        ]),
        null,
      );
    }

    const input: VeicoloInput = {
      tipoVeicolo: veicolo.tipoVeicolo,
      classeAmbientale: veicolo.classeAmbientale,
      alimentazione: veicolo.alimentazione,
      potenzaKw: toStringOrNull(veicolo.potenzaKw),
      cilindrata: veicolo.cilindrata,
      portataKg: veicolo.portataKg,
      pesoComplessivoKg: veicolo.pesoComplessivoKg,
      numeroAssi: veicolo.numeroAssi,
      tipoSospensione: veicolo.tipoSospensione,
      numeroPosti: veicolo.numeroPosti,
      massaRimorchiabileKg: veicolo.massaRimorchiabileKg,
      dataImmatricolazione: veicolo.dataImmatricolazione
        ? veicolo.dataImmatricolazione.toISOString().slice(0, 10)
        : null,
    };

    // L'anzianità è misurata alla data odierna, come nel motore precedente.
    const risultato = calcolaConMotore(input, tariffario, {
      periodicita,
      dataRiferimento: oggi(),
    });

    return this.adatta(risultato, tariffario);
  }

  /** Converte il risultato del motore nella forma dell'API. */
  private adatta(r: RisultatoCalcolo, tariffario: TariffarioInput | null): CalcolobolloResult {
    return {
      esito: r.esito,
      importoBase: toNumber(r.importo),
      importoLordo: toNumber(r.importoLordo),
      importoRidotto: toNumber(r.importoRidotto),
      scontoRid: Number(r.scontoRid),
      tariffeApplicate: r.voci.map((v) => ({
        descrizione: v.descrizione,
        importo: Number(v.importo),
        unitaMisura: v.unitaMisura,
        valore: toNumber(v.valore),
      })),
      esenzioni: r.esenzioni.map((e) => ({
        tipo: e.tipo,
        descrizione: e.descrizione,
        percentualeRiduzione: toNumber(e.percentualeRiduzione),
      })),
      motivi: r.motivi,
      assunzioni: r.assunzioni,
      note: r.note,
      dettaglioCalcolo:
        r.esito === 'NON_CALCOLABILE'
          ? ['Calcolo non possibile:', ...r.motivi.map((m) => `- ${m.messaggio}`)].join('\n')
          : r.dettaglio.join('\n'),
      versioneMotore: r.versioneMotore,
      idConfigurazione: tariffario?.id ?? null,
      regioneConfigurazione: tariffario?.regione ?? null,
    };
  }

  /** Calcola il bollo di tutti i veicoli attivi di un cliente. */
  async calcolaBolloPerCliente(
    idCliente: number,
    anno: number = new Date().getFullYear(),
  ): Promise<{ veicolo: unknown; calcolo: CalcolobolloResult }[]> {
    const veicoli = await this.prisma.veicolo.findMany({
      where: { idCliente, attivo: true },
      include: { cliente: true },
      orderBy: { targa: 'asc' },
    });

    const cache: CacheTariffari = new Map();
    const risultati: { veicolo: unknown; calcolo: CalcolobolloResult }[] = [];
    for (const veicolo of veicoli) {
      risultati.push({ veicolo, calcolo: await this.calcolaBollo(veicolo.id, anno, 'ANNUALE', cache) });
    }
    return risultati;
  }

  /**
   * Ricalcola l'importo previsto delle scadenze future non pagate di un
   * veicolo.
   *
   * Quando il calcolo non è possibile l'importo esistente NON viene toccato:
   * il motore precedente lo sovrascriveva con zero, cancellando l'importo
   * importato dall'archivio o inserito a mano.
   */
  async aggiornaImportiScadenze(
    idVeicolo: number,
    utente?: string,
    opzioni: { soloMancanti?: boolean } = {},
  ): Promise<EsitoAggiornamentoImporti> {
    const annoCorrente = new Date().getFullYear();
    const scadenze = await this.prisma.scadenza.findMany({
      where: {
        idVeicolo,
        stato: 'DA_PAGARE',
        annoScadenza: { gte: annoCorrente },
        ...(opzioni.soloMancanti ? { importoPrevisto: null } : {}),
      },
      orderBy: { dataScadenza: 'asc' },
    });

    const esito: EsitoAggiornamentoImporti = { aggiornate: 0, nonCalcolabili: 0, motivi: [] };
    const cache: CacheTariffari = new Map();

    for (const scadenza of scadenze) {
      const calcolo = await this.calcolaBollo(
        idVeicolo,
        scadenza.annoScadenza,
        scadenza.periodicita as Periodicita,
        cache,
      );

      if (calcolo.esito === 'NON_CALCOLABILE') {
        esito.nonCalcolabili++;
        for (const m of calcolo.motivi) {
          if (!esito.motivi.includes(m.messaggio)) esito.motivi.push(m.messaggio);
        }
        continue;
      }

      await this.prisma.scadenza.update({
        where: { id: scadenza.id },
        data: { importoPrevisto: calcolo.importoBase },
      });
      await this.audit.registra({
        entita: 'scadenza',
        idEntita: scadenza.id,
        azione: 'MODIFICA',
        utente,
        datiPrima: { importoPrevisto: scadenza.importoPrevisto },
        datiDopo: { importoPrevisto: calcolo.importoBase },
        note: opzioni.soloMancanti
          ? `Importo mancante calcolato dal tariffario dopo il completamento dei dati del veicolo (motore ${calcolo.versioneMotore})`
          : `Ricalcolo massivo dal tariffario (motore ${calcolo.versioneMotore})`,
      });
      esito.aggiornate++;
    }

    return esito;
  }

  /**
   * Calcola l'importo delle sole scadenze future che non ne hanno uno.
   *
   * È ciò che serve dopo aver completato i dati di un veicolo: gli importi
   * già presenti (dall'archivio o inseriti a mano) non vengono toccati.
   * Per ricalcolarli tutti c'è aggiornaImportiScadenze, come scelta esplicita.
   */
  completaImportiMancanti(idVeicolo: number, utente?: string): Promise<EsitoAggiornamentoImporti> {
    return this.aggiornaImportiScadenze(idVeicolo, utente, { soloMancanti: true });
  }
}
