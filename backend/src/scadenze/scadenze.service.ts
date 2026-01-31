import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScadenzaDto } from './dto/create-scadenza.dto';
import { UpdateScadenzaDto } from './dto/update-scadenza.dto';
import { BolloService } from '../bollo/bollo.service';
import { StatoScadenza, Periodicita } from '../prisma/types';

/**
 * MESI DI SCADENZA QUADRIMESTRALE secondo normativa:
 * - Gennaio (mese 1): scadenza ultimo giorno mese
 * - Maggio (mese 5): scadenza 31 maggio
 * - Settembre (mese 9): scadenza 30 settembre
 */
const MESI_QUADRIMESTRE = [1, 5, 9];

/**
 * Date specifiche di scadenza per periodicità quadrimestrale
 * secondo normativa regionale Lombardia 2026
 */
const DATE_SCADENZA_QUADRIMESTRALE: Record<number, { giorno: number }> = {
  1: { giorno: 31 },  // Gennaio: 31 gennaio
  5: { giorno: 31 },  // Maggio: 31 maggio
  9: { giorno: 30 },  // Settembre: 30 settembre
};

@Injectable()
export class ScadenzeService {
  constructor(
    private prisma: PrismaService,
    private bolloService: BolloService,
  ) {}

  // =====================================================
  // UTILITY DATE - Timezone-safe
  // =====================================================

  /**
   * Ottiene la data odierna normalizzata a mezzanotte UTC.
   * Questo garantisce consistenza indipendentemente dal timezone del server.
   */
  private getOggiNormalizzato(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
  }

  /**
   * Crea una data normalizzata a mezzanotte UTC.
   * Utile per confronti consistenti tra date.
   */
  private creaDataNormalizzata(anno: number, mese: number, giorno: number): Date {
    return new Date(Date.UTC(anno, mese - 1, giorno, 0, 0, 0, 0));
  }

  /**
   * Ottiene l'ultimo giorno del mese (gestisce anni bisestili).
   * @param anno - Anno (es. 2024)
   * @param mese - Mese 1-12
   * @returns Numero del giorno (28, 29, 30 o 31)
   */
  private getUltimoGiornoDelMese(anno: number, mese: number): number {
    // Date(anno, mese, 0) restituisce l'ultimo giorno del mese precedente
    // Quindi Date(2024, 2, 0) → 29 febbraio 2024 (bisestile)
    //       Date(2025, 2, 0) → 28 febbraio 2025 (non bisestile)
    return new Date(anno, mese, 0).getDate();
  }

  // Utility legacy: ottiene l'ultimo giorno del mese come Date
  private getUltimoGiornoMese(anno: number, mese: number): Date {
    // mese è 1-12, Date usa 0-11, quindi mese senza -1 dà il primo giorno del mese successivo
    // sottraendo 1 giorno otteniamo l'ultimo giorno del mese desiderato
    return new Date(anno, mese, 0);
  }

  // Utility: ottiene il primo giorno del mese
  private getPrimoGiornoMese(anno: number, mese: number): Date {
    return new Date(anno, mese - 1, 1);
  }

  /**
   * Calcola la data effettiva di scadenza considerando la periodicità.
   * Restituisce date normalizzate UTC per consistenza nei confronti.
   *
   * Per periodicità ANNUALE: ultimo giorno del mese di scadenza
   * Per periodicità QUADRIMESTRALE: date specifiche secondo normativa
   *   - Gennaio: 31 gennaio
   *   - Maggio: 31 maggio
   *   - Settembre: 30 settembre
   *
   * Gestisce correttamente:
   * - Anni bisestili (febbraio 29 vs 28 giorni)
   * - Mesi con 30 vs 31 giorni
   *
   * @param anno - Anno di scadenza
   * @param mese - Mese di scadenza (1-12)
   * @param periodicita - 'ANNUALE' o 'QUADRIMESTRALE'
   * @returns Data effettiva di scadenza (normalizzata UTC a mezzanotte)
   */
  getDataScadenzaEffettiva(
    anno: number,
    mese: number,
    periodicita: 'ANNUALE' | 'QUADRIMESTRALE' = 'ANNUALE',
  ): Date {
    if (periodicita === 'QUADRIMESTRALE') {
      // Verifica che il mese sia valido per la periodicità quadrimestrale
      if (!MESI_QUADRIMESTRE.includes(mese)) {
        // Trova il prossimo mese quadrimestrale valido
        const prossimoMese = MESI_QUADRIMESTRE.find((m) => m >= mese) || MESI_QUADRIMESTRE[0];
        const annoEffettivo = prossimoMese < mese ? anno + 1 : anno;
        mese = prossimoMese;
        anno = annoEffettivo;
      }

      // Usa la data specifica per il quadrimestre
      const configData = DATE_SCADENZA_QUADRIMESTRALE[mese];
      if (configData) {
        // Verifica che il giorno sia valido per il mese (gestisce anni bisestili)
        const ultimoGiornoMese = this.getUltimoGiornoDelMese(anno, mese);
        const giornoEffettivo = Math.min(configData.giorno, ultimoGiornoMese);
        // Usa UTC per consistenza
        return this.creaDataNormalizzata(anno, mese, giornoEffettivo);
      }
    }

    // Default: ultimo giorno del mese per periodicità ANNUALE
    const ultimoGiorno = this.getUltimoGiornoDelMese(anno, mese);
    return this.creaDataNormalizzata(anno, mese, ultimoGiorno);
  }

  /**
   * Verifica se una scadenza è in scadenza considerando la periodicità.
   * Usa date normalizzate UTC per evitare problemi di timezone e DST.
   *
   * @param scadenza - Oggetto scadenza
   * @param giorniAnticipo - Giorni di anticipo per la notifica (default: 30)
   * @returns true se la scadenza è imminente
   */
  isScadenzaImminente(
    scadenza: { annoScadenza: number; meseScadenza: number; periodicita: string },
    giorniAnticipo: number = 30,
  ): boolean {
    const oggi = this.getOggiNormalizzato();

    const dataScadenza = this.getDataScadenzaEffettiva(
      scadenza.annoScadenza,
      scadenza.meseScadenza,
      scadenza.periodicita as 'ANNUALE' | 'QUADRIMESTRALE',
    );

    // Calcola data limite usando millisecondi per evitare problemi con DST
    const MILLISECONDI_PER_GIORNO = 24 * 60 * 60 * 1000;
    const dataLimite = new Date(oggi.getTime() + (giorniAnticipo * MILLISECONDI_PER_GIORNO));

    // La scadenza è imminente se:
    // - Non è ancora passata (dataScadenza >= oggi)
    // - È entro il limite di anticipo (dataScadenza <= dataLimite)
    return dataScadenza.getTime() >= oggi.getTime() && dataScadenza.getTime() <= dataLimite.getTime();
  }

  /**
   * Calcola i giorni rimanenti alla scadenza.
   * Usa calcolo basato su millisecondi per precisione con anni bisestili e DST.
   *
   * @param scadenza - Oggetto scadenza
   * @returns Numero di giorni rimanenti (negativo se scaduta)
   */
  getGiorniAllaScadenza(
    scadenza: { annoScadenza: number; meseScadenza: number; periodicita: string },
  ): number {
    const oggi = this.getOggiNormalizzato();

    const dataScadenza = this.getDataScadenzaEffettiva(
      scadenza.annoScadenza,
      scadenza.meseScadenza,
      scadenza.periodicita as 'ANNUALE' | 'QUADRIMESTRALE',
    );

    const MILLISECONDI_PER_GIORNO = 24 * 60 * 60 * 1000;
    const diffTime = dataScadenza.getTime() - oggi.getTime();
    return Math.ceil(diffTime / MILLISECONDI_PER_GIORNO);
  }

  /**
   * Valida il mese di scadenza per la periodicità selezionata
   *
   * @param mese - Mese di scadenza (1-12)
   * @param periodicita - 'ANNUALE' o 'QUADRIMESTRALE'
   * @returns Oggetto con validazione e suggerimenti
   */
  validaMeseScadenza(
    mese: number,
    periodicita: 'ANNUALE' | 'QUADRIMESTRALE',
  ): { valido: boolean; messaggio?: string; mesiValidi?: number[] } {
    if (periodicita === 'QUADRIMESTRALE') {
      if (!MESI_QUADRIMESTRE.includes(mese)) {
        return {
          valido: false,
          messaggio: `Per la periodicità quadrimestrale, i mesi validi sono: Gennaio (1), Maggio (5), Settembre (9)`,
          mesiValidi: MESI_QUADRIMESTRE,
        };
      }
    }

    if (mese < 1 || mese > 12) {
      return {
        valido: false,
        messaggio: 'Il mese deve essere compreso tra 1 e 12',
      };
    }

    return { valido: true };
  }

  async create(createScadenzaDto: CreateScadenzaDto) {
    const periodicita = (createScadenzaDto.periodicita as 'ANNUALE' | 'QUADRIMESTRALE') || 'ANNUALE';

    // Valida il mese di scadenza per la periodicità selezionata
    const validazione = this.validaMeseScadenza(createScadenzaDto.meseScadenza, periodicita);
    if (!validazione.valido) {
      throw new Error(validazione.messaggio);
    }

    let importoPrevisto = createScadenzaDto.importoPrevisto;

    // Se l'importo non è specificato, calcolalo automaticamente
    if (importoPrevisto === undefined || importoPrevisto === null) {
      try {
        const calcolo = await this.bolloService.calcolaBollo(
          createScadenzaDto.idVeicolo,
          createScadenzaDto.annoScadenza,
          periodicita,
        );
        importoPrevisto = calcolo.importoBase;
      } catch (error) {
        // Se il calcolo fallisce, lascia l'importo nullo
        console.warn(`Impossibile calcolare il bollo per veicolo ${createScadenzaDto.idVeicolo}:`, error.message);
      }
    }

    return this.prisma.scadenza.create({
      data: {
        idVeicolo: createScadenzaDto.idVeicolo,
        meseScadenza: createScadenzaDto.meseScadenza,
        annoScadenza: createScadenzaDto.annoScadenza,
        periodicita: periodicita,
        importoPrevisto: importoPrevisto,
        stato: createScadenzaDto.stato,
      },
      include: {
        veicolo: {
          include: {
            cliente: true,
          },
        },
      },
    });
  }

  /**
   * Ricalcola l'importo di una scadenza esistente
   */
  async ricalcolaImporto(id: number) {
    const scadenza = await this.findOne(id);

    try {
      const calcolo = await this.bolloService.calcolaBollo(
        scadenza.idVeicolo,
        scadenza.annoScadenza,
        scadenza.periodicita as 'ANNUALE' | 'QUADRIMESTRALE',
      );

      return this.prisma.scadenza.update({
        where: { id },
        data: { importoPrevisto: calcolo.importoBase },
        include: {
          veicolo: { include: { cliente: true } },
        },
      });
    } catch (error) {
      throw new Error(`Impossibile ricalcolare il bollo: ${error.message}`);
    }
  }

  async findAll(
    stato?: StatoScadenza,
    idCliente?: number,
    meseScadenza?: number,
    annoScadenza?: number,
  ) {
    // NOTE: updateScaduteAutomaticamente rimosso da qui per performance
    // Usare un cron job separato per aggiornare gli stati

    const where: any = {};

    if (stato) {
      where.stato = stato;
    }

    if (idCliente) {
      where.veicolo = {
        idCliente: idCliente,
      };
    }

    // Filtro per mese/anno (ottimizzazione per scadenziario)
    if (meseScadenza) {
      where.meseScadenza = meseScadenza;
    }

    if (annoScadenza) {
      where.annoScadenza = annoScadenza;
    }

    return this.prisma.scadenza.findMany({
      where,
      include: {
        veicolo: {
          include: {
            cliente: {
              select: {
                id: true,
                ragioneSociale: true,
                nome: true,
                cognome: true,
              },
            },
          },
        },
        _count: {
          select: { pagamenti: true },
        },
      },
      orderBy: [
        { annoScadenza: 'desc' },
        { meseScadenza: 'desc' },
      ],
    });
  }

  /**
   * Versione paginata di findAll per dataset grandi (report, export).
   * Previene memory overflow caricando i dati in chunk.
   *
   * @param options - Opzioni di paginazione e filtro
   * @returns Pagina di scadenze con metadata paginazione
   */
  async findAllPaginated(options: {
    page?: number;
    pageSize?: number;
    stato?: StatoScadenza;
    idCliente?: number;
    annoFrom?: number;
    annoTo?: number;
  }) {
    const {
      page = 1,
      pageSize = 100,
      stato,
      idCliente,
      annoFrom,
      annoTo,
    } = options;

    // Aggiorna scadenze scadute (non fare in ogni request se impatta performance)
    // await this.updateScaduteAutomaticamente();

    const where: any = {};

    if (stato) {
      where.stato = stato;
    }

    if (idCliente) {
      where.veicolo = {
        idCliente: idCliente,
      };
    }

    // Filtro per intervallo anni (utile per report annuali)
    if (annoFrom || annoTo) {
      where.annoScadenza = {};
      if (annoFrom) where.annoScadenza.gte = annoFrom;
      if (annoTo) where.annoScadenza.lte = annoTo;
    }

    // Query parallele per dati e conteggio totale
    const [data, totalCount] = await Promise.all([
      this.prisma.scadenza.findMany({
        where,
        include: {
          veicolo: {
            include: {
              cliente: true,
            },
          },
          pagamenti: true,
        },
        orderBy: [
          { annoScadenza: 'desc' },
          { meseScadenza: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.scadenza.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      data,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Conta scadenze raggruppate per stato (per dashboard e summary)
   * Più efficiente di caricare tutti i dati
   */
  async getStatsCounts(idCliente?: number) {
    const where: any = {};

    if (idCliente) {
      where.veicolo = { idCliente };
    }

    const [daPagare, pagato, scaduto, totaleImporto] = await Promise.all([
      this.prisma.scadenza.count({ where: { ...where, stato: StatoScadenza.DA_PAGARE } }),
      this.prisma.scadenza.count({ where: { ...where, stato: StatoScadenza.PAGATO } }),
      this.prisma.scadenza.count({ where: { ...where, stato: StatoScadenza.SCADUTO } }),
      this.prisma.scadenza.aggregate({
        where,
        _sum: { importoPrevisto: true },
      }),
    ]);

    return {
      daPagare,
      pagato,
      scaduto,
      totale: daPagare + pagato + scaduto,
      importoTotale: totaleImporto._sum.importoPrevisto?.toNumber() || 0,
    };
  }

  async findOne(id: number) {
    const scadenza = await this.prisma.scadenza.findUnique({
      where: { id },
      include: {
        veicolo: {
          include: {
            cliente: true,
          },
        },
        pagamenti: true,
      },
    });

    if (!scadenza) {
      throw new NotFoundException(`Scadenza con ID ${id} non trovata`);
    }

    return scadenza;
  }

  async update(id: number, updateScadenzaDto: UpdateScadenzaDto) {
    await this.findOne(id); // Check if exists

    return this.prisma.scadenza.update({
      where: { id },
      data: updateScadenzaDto,
      include: {
        veicolo: {
          include: {
            cliente: true,
          },
        },
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id); // Check if exists

    return this.prisma.scadenza.delete({
      where: { id },
    });
  }

  /**
   * Aggiorna automaticamente le scadenze scadute usando raw SQL per performance.
   * Una scadenza è scaduta se siamo oltre la data effettiva di scadenza,
   * calcolata in base alla periodicità (ANNUALE o QUADRIMESTRALE).
   *
   * Questa versione usa una singola query SQL invece di caricare tutti i dati
   * e processarli in JavaScript, migliorando drasticamente la performance.
   */
  async updateScaduteAutomaticamente() {
    // Query SQL ottimizzata che calcola la data di scadenza nel DB
    // e aggiorna direttamente le scadenze scadute
    const result = await this.prisma.$executeRaw`
      UPDATE scadenze
      SET stato = 'SCADUTO', "updatedAt" = NOW()
      WHERE stato = 'DA_PAGARE'
        AND (
          -- Calcola l'ultimo giorno del mese di scadenza
          make_date(anno_scadenza, mese_scadenza, 1) + interval '1 month' - interval '1 day'
        )::date < CURRENT_DATE
    `;

    return result;
  }

  /**
   * Ottieni scadenze in scadenza (per notifiche) - VERSIONE OTTIMIZZATA
   * Una scadenza è "in scadenza" se la sua data effettiva cade entro i prossimi N giorni.
   *
   * Questa versione filtra direttamente nel DB invece di caricare tutti i dati.
   *
   * @param giorniAnticipo - Numero di giorni di anticipo per le notifiche (default: 30)
   * @returns Lista di scadenze imminenti con dettagli veicolo e cliente
   */
  async getScadenzeInScadenza(giorniAnticipo: number = 30) {
    const oggi = this.getOggiNormalizzato();
    const dataLimite = new Date(oggi.getTime() + giorniAnticipo * 24 * 60 * 60 * 1000);

    // Calcola mese/anno corrente e futuro per filtrare nel DB
    const meseOggi = oggi.getMonth() + 1;
    const annoOggi = oggi.getFullYear();
    const meseLimite = dataLimite.getMonth() + 1;
    const annoLimite = dataLimite.getFullYear();

    // Query ottimizzata: filtra per mese/anno nel DB
    const scadenzeDaPagare = await this.prisma.scadenza.findMany({
      where: {
        stato: StatoScadenza.DA_PAGARE,
        OR: [
          // Scadenze di quest'anno nel range di mesi
          {
            annoScadenza: annoOggi,
            meseScadenza: { gte: meseOggi, lte: annoOggi === annoLimite ? meseLimite : 12 },
          },
          // Scadenze dell'anno prossimo se il range attraversa l'anno
          ...(annoLimite > annoOggi
            ? [
                {
                  annoScadenza: annoLimite,
                  meseScadenza: { lte: meseLimite },
                },
              ]
            : []),
        ],
      },
      include: {
        veicolo: {
          include: {
            cliente: {
              select: {
                id: true,
                ragioneSociale: true,
                nome: true,
                cognome: true,
                email: true,
                telefono: true,
              },
            },
          },
        },
      },
      orderBy: [
        { annoScadenza: 'asc' },
        { meseScadenza: 'asc' },
      ],
    });

    // Filtro finale in memoria (per precisione) e arricchimento
    const scadenzeArricchite = scadenzeDaPagare
      .filter((scadenza) =>
        this.isScadenzaImminente(
          {
            annoScadenza: scadenza.annoScadenza,
            meseScadenza: scadenza.meseScadenza,
            periodicita: scadenza.periodicita,
          },
          giorniAnticipo,
        ),
      )
      .map((scadenza) => {
        const giorniRimanenti = this.getGiorniAllaScadenza({
          annoScadenza: scadenza.annoScadenza,
          meseScadenza: scadenza.meseScadenza,
          periodicita: scadenza.periodicita,
        });

        const dataScadenzaEffettiva = this.getDataScadenzaEffettiva(
          scadenza.annoScadenza,
          scadenza.meseScadenza,
          scadenza.periodicita as 'ANNUALE' | 'QUADRIMESTRALE',
        );

        return {
          ...scadenza,
          giorniRimanenti,
          dataScadenzaEffettiva,
          urgenza: giorniRimanenti <= 7 ? 'CRITICA' : giorniRimanenti <= 14 ? 'ALTA' : 'NORMALE',
        };
      });

    // Ordina per urgenza (giorni rimanenti crescenti)
    return scadenzeArricchite.sort((a, b) => a.giorniRimanenti - b.giorniRimanenti);
  }
}
