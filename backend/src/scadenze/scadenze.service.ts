import { Injectable, NotFoundException, BadRequestException, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScadenzaDto } from './dto/create-scadenza.dto';
import { UpdateScadenzaDto } from './dto/update-scadenza.dto';
import { BolloService } from '../bollo/bollo.service';
import { StatoScadenza, Periodicita } from '../prisma/types';

/**
 * Calcola i 3 mesi di scadenza quadrimestrale partendo dal mese di immatricolazione.
 * Le scadenze sono ogni 4 mesi a partire dal mese di immatricolazione.
 *
 * Esempio: immatricolazione Marzo (3)
 * - Scadenza 1: Marzo (3)
 * - Scadenza 2: Luglio (3 + 4 = 7)
 * - Scadenza 3: Novembre (3 + 8 = 11)
 *
 * @param meseImmatricolazione - Mese di immatricolazione (1-12)
 * @returns Array di 3 mesi di scadenza
 */
function getMesiScadenzaQuadrimestrale(meseImmatricolazione: number): number[] {
  const mesi: number[] = [];
  for (let i = 0; i < 3; i++) {
    let mese = meseImmatricolazione + (i * 4);
    if (mese > 12) mese -= 12;
    mesi.push(mese);
  }
  return mesi;
}

// Intervallo di aggiornamento automatico degli stati scaduti (6 ore)
const AGGIORNA_SCADUTE_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class ScadenzeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScadenzeService.name);
  private aggiornaScaduteTimer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private bolloService: BolloService,
  ) {}

  /**
   * All'avvio (e poi ogni 6 ore) marca come SCADUTO le scadenze DA_PAGARE
   * il cui mese/anno è passato. Sostituisce il cron job esterno mai configurato.
   */
  async onModuleInit() {
    await this.eseguiAggiornamentoScadute();
    this.aggiornaScaduteTimer = setInterval(
      () => this.eseguiAggiornamentoScadute(),
      AGGIORNA_SCADUTE_INTERVAL_MS,
    );
    // Non tenere vivo il processo solo per il timer
    this.aggiornaScaduteTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.aggiornaScaduteTimer) {
      clearInterval(this.aggiornaScaduteTimer);
    }
  }

  private async eseguiAggiornamentoScadute() {
    try {
      const aggiornate = await this.updateScaduteAutomaticamente();
      if (aggiornate > 0) {
        this.logger.log(`Aggiornate ${aggiornate} scadenze a stato SCADUTO`);
      }
    } catch (error) {
      this.logger.error(`Errore aggiornamento scadenze scadute: ${error.message}`);
    }
  }

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
   * La scadenza cade sempre l'ultimo giorno del mese di scadenza,
   * sia per periodicità ANNUALE che QUADRIMESTRALE.
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
    // La scadenza cade sempre l'ultimo giorno del mese
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
   * Valida il mese di scadenza.
   *
   * Il mese di scadenza dipende dalla data di immatricolazione del veicolo:
   * - Per ANNUALE: il mese è quello di immatricolazione
   * - Per QUADRIMESTRALE: i mesi sono ogni 4 mesi a partire da quello di immatricolazione
   *
   * Quindi qualsiasi mese (1-12) è valido, a seconda della data di immatricolazione.
   *
   * @param mese - Mese di scadenza (1-12)
   * @param periodicita - 'ANNUALE' o 'QUADRIMESTRALE'
   * @returns Oggetto con validazione
   */
  validaMeseScadenza(
    mese: number,
    periodicita: 'ANNUALE' | 'QUADRIMESTRALE',
  ): { valido: boolean; messaggio?: string } {
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
      throw new BadRequestException(validazione.messaggio);
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
      throw new BadRequestException(`Impossibile ricalcolare il bollo: ${error.message}`);
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

    const where: any = {
      // Filtra solo scadenze di veicoli appartenenti a clienti attivi
      veicolo: {
        attivo: true,
        cliente: {
          attivo: true,
        },
      },
    };

    if (stato) {
      where.stato = stato;
    }

    if (idCliente) {
      where.veicolo = {
        ...where.veicolo,
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
                attivo: true,
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

    const where: any = {
      // Filtra solo scadenze di veicoli appartenenti a clienti attivi
      veicolo: {
        attivo: true,
        cliente: {
          attivo: true,
        },
      },
    };

    if (stato) {
      where.stato = stato;
    }

    if (idCliente) {
      where.veicolo = {
        ...where.veicolo,
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
    const where: any = {
      // Filtra solo scadenze di veicoli appartenenti a clienti attivi
      veicolo: {
        attivo: true,
        cliente: {
          attivo: true,
        },
      },
    };

    if (idCliente) {
      where.veicolo = { ...where.veicolo, idCliente };
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
   * Aggiorna automaticamente le scadenze scadute.
   * Una scadenza è scaduta solo se il mese/anno di scadenza è PRECEDENTE
   * al mese/anno corrente. Le scadenze del mese corrente restano DA_PAGARE.
   *
   * BUG FIX: Usa Prisma ORM invece di raw SQL per evitare problemi
   * se lo schema cambia (colonne hardcoded nel raw SQL sono fragili).
   */
  async updateScaduteAutomaticamente() {
    const oggi = this.getOggiNormalizzato();
    const annoCorrente = oggi.getFullYear();
    const meseCorrente = oggi.getMonth() + 1;

    // Usa Prisma ORM invece di raw SQL per robustezza
    const result = await this.prisma.scadenza.updateMany({
      where: {
        stato: StatoScadenza.DA_PAGARE,
        OR: [
          // Anno passato
          { annoScadenza: { lt: annoCorrente } },
          // Stesso anno ma mese passato
          {
            annoScadenza: annoCorrente,
            meseScadenza: { lt: meseCorrente },
          },
        ],
      },
      data: {
        stato: StatoScadenza.SCADUTO,
      },
    });

    return result.count;
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
        // Filtra solo scadenze di veicoli appartenenti a clienti attivi
        veicolo: {
          attivo: true,
          cliente: {
            attivo: true,
          },
        },
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
                attivo: true,
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

  /**
   * Genera scadenze future per tutti i veicoli fino all'anno specificato.
   *
   * Per ogni veicolo:
   * - Determina il mese di scadenza dalla scadenza più recente, o dal mese di immatricolazione
   * - Determina la periodicità dalla scadenza più recente, o default ANNUALE
   * - Genera le scadenze mancanti fino all'anno target
   * - Calcola automaticamente l'importo previsto
   *
   * @param annoTarget - Anno fino al quale generare le scadenze (incluso)
   * @returns Statistiche sulla generazione
   */
  async generaScadenzeFuture(annoTarget: number): Promise<{
    veicoliProcessati: number;
    scadenzeCreate: number;
    scadenzeSaltate: number;
    errori: string[];
  }> {
    const oggi = this.getOggiNormalizzato();
    const annoCorrente = oggi.getFullYear();
    const meseCorrente = oggi.getMonth() + 1;

    if (!Number.isInteger(annoTarget) || annoTarget < annoCorrente) {
      throw new BadRequestException(`L'anno target (${annoTarget}) non può essere inferiore all'anno corrente (${annoCorrente})`);
    }

    if (annoTarget > annoCorrente + 10) {
      throw new BadRequestException(`L'anno target non può essere superiore a ${annoCorrente + 10}`);
    }

    const risultato = {
      veicoliProcessati: 0,
      scadenzeCreate: 0,
      scadenzeSaltate: 0,
      errori: [] as string[],
    };

    // Cache configurazioni tariffe: evita di ricaricarle per ogni veicolo
    const configCache = new Map<string, any>();

    // Recupera solo i veicoli di clienti attivi con le loro scadenze esistenti
    const veicoli = await this.prisma.veicolo.findMany({
      where: {
        attivo: true,
        cliente: {
          attivo: true,
        },
      },
      include: {
        scadenze: {
          orderBy: [
            { annoScadenza: 'desc' },
            { meseScadenza: 'desc' },
          ],
          take: 1, // Solo la più recente
        },
        cliente: {
          select: { id: true, ragioneSociale: true, nome: true, cognome: true, attivo: true },
        },
      },
    });

    for (const veicolo of veicoli) {
      risultato.veicoliProcessati++;

      try {
        // Il mese di scadenza dipende SEMPRE dalla data di immatricolazione
        let meseScadenza: number;
        let meseImmatricolazione: number | null = null;
        let periodicita: 'ANNUALE' | 'QUADRIMESTRALE';

        // Estrai il mese di immatricolazione (obbligatorio per calcolare la scadenza)
        if (veicolo.dataImmatricolazione) {
          const dataImm = new Date(veicolo.dataImmatricolazione);
          meseImmatricolazione = dataImm.getMonth() + 1;
        }

        // Determina la periodicità dalla scadenza più recente o default ANNUALE
        if (veicolo.scadenze.length > 0) {
          periodicita = veicolo.scadenze[0].periodicita as 'ANNUALE' | 'QUADRIMESTRALE';
        } else {
          periodicita = 'ANNUALE';
        }

        // Calcola il mese di scadenza in base alla data di immatricolazione
        if (meseImmatricolazione) {
          // Il mese di scadenza per ANNUALE è il mese di immatricolazione
          // Per QUADRIMESTRALE useremo meseImmatricolazione per calcolare i 3 mesi
          meseScadenza = meseImmatricolazione;
        } else if (veicolo.scadenze.length > 0) {
          // Fallback: usa il mese dalla scadenza esistente se non c'è data immatricolazione
          meseScadenza = veicolo.scadenze[0].meseScadenza;
        } else {
          // Nessuna data immatricolazione e nessuna scadenza esistente: salta con avviso
          risultato.errori.push(`Veicolo ${veicolo.targa}: data immatricolazione mancante, impossibile calcolare scadenza`);
          continue;
        }

        // Genera scadenze per ogni periodo fino all'anno target
        const scadenzeDaCreare = this.calcolaScadenzeDaCreare(
          veicolo.id,
          meseScadenza, // Per QUADRIMESTRALE questo è il meseImmatricolazione
          periodicita,
          annoCorrente,
          meseCorrente,
          annoTarget,
        );

        // Verifica quali scadenze esistono già
        const scadenzeEsistenti = await this.prisma.scadenza.findMany({
          where: {
            idVeicolo: veicolo.id,
            annoScadenza: { gte: annoCorrente, lte: annoTarget },
          },
          select: { meseScadenza: true, annoScadenza: true },
        });

        const esistentiSet = new Set(
          scadenzeEsistenti.map(s => `${s.annoScadenza}-${s.meseScadenza}`)
        );

        // Filtra scadenze non esistenti
        const scadenzeNuove = scadenzeDaCreare.filter(scadenza => {
          const chiave = `${scadenza.annoScadenza}-${scadenza.meseScadenza}`;
          if (esistentiSet.has(chiave)) {
            risultato.scadenzeSaltate++;
            return false;
          }
          return true;
        });

        if (scadenzeNuove.length === 0) {
          continue;
        }

        // Calcola importo una sola volta per veicolo (ottimizzazione)
        // L'importo è lo stesso per tutte le scadenze dello stesso veicolo/periodicità
        let importoPrevisto: number | undefined;
        try {
          const calcolo = await this.bolloService.calcolaBollo(
            veicolo.id,
            annoCorrente,
            periodicita,
            configCache,
          );
          importoPrevisto = calcolo.importoBase;
        } catch (error) {
          console.warn(`Impossibile calcolare bollo per veicolo ${veicolo.targa}:`, error.message);
        }

        // Prepara batch di scadenze da creare
        const scadenzeBatch = scadenzeNuove.map(scadenza => ({
          idVeicolo: veicolo.id,
          meseScadenza: scadenza.meseScadenza,
          annoScadenza: scadenza.annoScadenza,
          periodicita: periodicita,
          importoPrevisto: importoPrevisto,
          stato: StatoScadenza.DA_PAGARE,
        }));

        // Crea tutte le scadenze in batch (molto più veloce)
        await this.prisma.scadenza.createMany({
          data: scadenzeBatch,
        });

        risultato.scadenzeCreate += scadenzeNuove.length;
      } catch (error) {
        risultato.errori.push(`Veicolo ${veicolo.targa}: ${error.message}`);
      }
    }

    return risultato;
  }

  /**
   * Calcola le scadenze da creare per un veicolo in base alla periodicità.
   *
   * Per ANNUALE: una scadenza all'anno nel mese di immatricolazione
   * Per QUADRIMESTRALE: 3 scadenze all'anno, ogni 4 mesi a partire dal mese di immatricolazione
   *
   * @param idVeicolo - ID del veicolo
   * @param meseImmatricolazione - Mese di immatricolazione (usato per calcolare i mesi di scadenza)
   * @param periodicita - ANNUALE o QUADRIMESTRALE
   * @param annoCorrente - Anno corrente
   * @param meseCorrente - Mese corrente
   * @param annoTarget - Anno fino al quale generare le scadenze
   */
  private calcolaScadenzeDaCreare(
    idVeicolo: number,
    meseImmatricolazione: number,
    periodicita: 'ANNUALE' | 'QUADRIMESTRALE',
    annoCorrente: number,
    meseCorrente: number,
    annoTarget: number,
  ): { meseScadenza: number; annoScadenza: number }[] {
    const scadenze: { meseScadenza: number; annoScadenza: number }[] = [];

    if (periodicita === 'ANNUALE') {
      // Una scadenza all'anno nel mese di immatricolazione
      for (let anno = annoCorrente; anno <= annoTarget; anno++) {
        // Salta se la scadenza è già passata nell'anno corrente
        if (anno === annoCorrente && meseImmatricolazione < meseCorrente) {
          continue;
        }
        scadenze.push({ meseScadenza: meseImmatricolazione, annoScadenza: anno });
      }
    } else {
      // QUADRIMESTRALE: 3 scadenze all'anno, ogni 4 mesi dal mese di immatricolazione
      // Es: immatricolazione Marzo (3) → scadenze a Marzo (3), Luglio (7), Novembre (11)
      const mesiQuadrimestrali = getMesiScadenzaQuadrimestrale(meseImmatricolazione);

      for (let anno = annoCorrente; anno <= annoTarget; anno++) {
        for (const mese of mesiQuadrimestrali) {
          // Salta se la scadenza è già passata
          if (anno === annoCorrente && mese < meseCorrente) {
            continue;
          }
          scadenze.push({ meseScadenza: mese, annoScadenza: anno });
        }
      }
    }

    return scadenze;
  }
}
