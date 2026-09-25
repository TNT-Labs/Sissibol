import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePagamentoDto } from './dto/create-pagamento.dto';
import { UpdatePagamentoDto } from './dto/update-pagamento.dto';
import { StatoScadenza } from '../prisma/types';
import { BolloService } from '../bollo/bollo.service';
import { AuditService } from '../audit/audit.service';

/** Campi del pagamento conservati nel registro delle modifiche. */
function istantaneaPagamento(pagamento: {
  id: number;
  idScadenza: number;
  dataPagamento: Date;
  importoPagato: unknown;
  metodoPagamento: string | null;
  ricevutaFile: string | null;
  version: number;
}) {
  return {
    id: pagamento.id,
    idScadenza: pagamento.idScadenza,
    dataPagamento: pagamento.dataPagamento,
    importoPagato: pagamento.importoPagato,
    metodoPagamento: pagamento.metodoPagamento,
    ricevutaFile: pagamento.ricevutaFile,
    version: pagamento.version,
  };
}

@Injectable()
export class PagamentiService {
  constructor(
    private prisma: PrismaService,
    private bolloService: BolloService,
    private audit: AuditService,
  ) {}

  /**
   * Crea un pagamento con snapshot immutabile del calcolo bollo.
   * Lo snapshot preserva le tariffe applicate per i report storici.
   */
  async create(createPagamentoDto: CreatePagamentoDto, utente?: string) {
    // Recupera la scadenza con il veicolo per lo snapshot
    const scadenza = await this.prisma.scadenza.findUnique({
      where: { id: createPagamentoDto.idScadenza },
      include: {
        veicolo: {
          include: { cliente: true },
        },
      },
    });

    if (!scadenza) {
      throw new NotFoundException(`Scadenza con ID ${createPagamentoDto.idScadenza} non trovata`);
    }

    // Calcolo del bollo da congelare nello snapshot. Il tariffario usato
    // (compreso l'eventuale ripiego su DEFAULT) arriva dal calcolo stesso:
    // la versione precedente lo rileggeva a parte e registrava la regione
    // del veicolo anche quando era stato applicato il tariffario DEFAULT.
    const calcolo = await this.bolloService.calcolaBollo(
      scadenza.idVeicolo,
      scadenza.annoScadenza,
      scadenza.periodicita as 'ANNUALE' | 'QUADRIMESTRALE',
    );

    // Uno snapshot documenta un importo determinato dal tariffario: se il
    // calcolo non è possibile non c'è nulla da congelare. Il pagamento viene
    // comunque registrato (è un fatto avvenuto) e il registro delle modifiche
    // lo annota. La versione precedente in questo caso salvava uno snapshot
    // con importo zero, cioè una prova falsa.
    const calcoloBollo =
      calcolo.esito !== 'NON_CALCOLABILE' && calcolo.idConfigurazione !== null ? calcolo : null;

    // Crea il pagamento e lo snapshot in una transazione atomica
    const result = await this.prisma.$transaction(async (tx) => {
      const pagamento = await tx.pagamento.create({
        data: {
          idScadenza: createPagamentoDto.idScadenza,
          dataPagamento: new Date(createPagamentoDto.dataPagamento),
          importoPagato: createPagamentoDto.importoPagato,
          metodoPagamento: createPagamentoDto.metodoPagamento,
          ricevutaFile: createPagamentoDto.ricevutaFile,
        },
        include: {
          scadenza: {
            include: {
              veicolo: {
                include: { cliente: true },
              },
            },
          },
        },
      });

      // Crea snapshot immutabile del calcolo (se disponibile)
      if (calcoloBollo) {
        await tx.snapshotCalcoloBollo.create({
          data: {
            idPagamento: pagamento.id,
            // Snapshot completo del veicolo al momento del pagamento
            veicoloSnapshot: {
              id: scadenza.veicolo.id,
              targa: scadenza.veicolo.targa,
              tipoVeicolo: scadenza.veicolo.tipoVeicolo,
              classeAmbientale: scadenza.veicolo.classeAmbientale,
              alimentazione: scadenza.veicolo.alimentazione,
              potenzaKw: scadenza.veicolo.potenzaKw ? Number(scadenza.veicolo.potenzaKw) : null,
              cilindrata: scadenza.veicolo.cilindrata,
              portataKg: scadenza.veicolo.portataKg,
              pesoComplessivoKg: scadenza.veicolo.pesoComplessivoKg,
              numeroAssi: scadenza.veicolo.numeroAssi,
              tipoSospensione: scadenza.veicolo.tipoSospensione,
              numeroPosti: scadenza.veicolo.numeroPosti,
              massaRimorchiabileKg: scadenza.veicolo.massaRimorchiabileKg,
              dataImmatricolazione: scadenza.veicolo.dataImmatricolazione,
              regione: scadenza.veicolo.regione,
            },
            // Snapshot tariffe ed esenzioni applicate
            tariffeApplicate: calcoloBollo.tariffeApplicate,
            esenzioniApplicate: calcoloBollo.esenzioni,
            // Importi calcolati
            importoBase: calcoloBollo.importoBase,
            importoRidotto: calcoloBollo.importoRidotto,
            scontoRidApplicato: calcoloBollo.scontoRid,
            dettaglioCalcolo: calcoloBollo.dettaglioCalcolo || '',
            versioneMotore: calcoloBollo.versioneMotore,
            assunzioni: calcoloBollo.assunzioni,
            // Riferimento al tariffario effettivamente applicato
            idConfigurazione: calcoloBollo.idConfigurazione,
            annoConfigurazione: scadenza.annoScadenza,
            regioneConfigurazione: calcoloBollo.regioneConfigurazione,
          },
        });
      }

      // Aggiorna lo stato della scadenza a PAGATO
      await tx.scadenza.update({
        where: { id: createPagamentoDto.idScadenza },
        data: { stato: StatoScadenza.PAGATO },
      });

      return pagamento;
    });

    await this.audit.registra({
      entita: 'pagamento',
      idEntita: result.id,
      azione: 'CREAZIONE',
      utente,
      datiDopo: istantaneaPagamento(result),
      note: calcoloBollo
        ? undefined
        : `Registrato senza snapshot: bollo non calcolabile (${calcolo.motivi
            .map((m) => m.messaggio)
            .join(' ')})`,
    });

    return result;
  }

  async findAll(idScadenza?: number) {
    const where = idScadenza ? { idScadenza } : {};

    return this.prisma.pagamento.findMany({
      where,
      include: {
        scadenza: {
          include: {
            veicolo: {
              include: {
                cliente: true,
              },
            },
          },
        },
      },
      orderBy: {
        dataPagamento: 'desc',
      },
    });
  }

  /**
   * Versione paginata di findAll per dataset grandi (report, export).
   * Previene memory overflow caricando i dati in chunk.
   *
   * @param options - Opzioni di paginazione e filtro
   * @returns Pagina di pagamenti con metadata paginazione
   */
  async findAllPaginated(options: {
    page?: number;
    pageSize?: number;
    idScadenza?: number;
    dateFrom?: Date;
    dateTo?: Date;
    idCliente?: number;
  }) {
    const {
      page = 1,
      pageSize = 100,
      idScadenza,
      dateFrom,
      dateTo,
      idCliente,
    } = options;

    const where: any = {};

    if (idScadenza) {
      where.idScadenza = idScadenza;
    }

    // Filtro per intervallo date
    if (dateFrom || dateTo) {
      where.dataPagamento = {};
      if (dateFrom) where.dataPagamento.gte = dateFrom;
      if (dateTo) where.dataPagamento.lte = dateTo;
    }

    // Filtro per cliente (attraverso relazione)
    if (idCliente) {
      where.scadenza = {
        veicolo: {
          idCliente,
        },
      };
    }

    // Query parallele per dati e conteggio totale
    const [data, totalCount, totaleImporto] = await Promise.all([
      this.prisma.pagamento.findMany({
        where,
        include: {
          scadenza: {
            include: {
              veicolo: {
                include: {
                  cliente: true,
                },
              },
            },
          },
        },
        orderBy: {
          dataPagamento: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.pagamento.count({ where }),
      this.prisma.pagamento.aggregate({
        where,
        _sum: { importoPagato: true },
      }),
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
      summary: {
        importoTotale: totaleImporto._sum.importoPagato?.toNumber() || 0,
      },
    };
  }

  async findOne(id: number) {
    const pagamento = await this.prisma.pagamento.findUnique({
      where: { id },
      include: {
        scadenza: {
          include: {
            veicolo: {
              include: {
                cliente: true,
              },
            },
          },
        },
      },
    });

    if (!pagamento) {
      throw new NotFoundException(`Pagamento con ID ${id} non trovato`);
    }

    return pagamento;
  }

  /**
   * Aggiorna un pagamento con optimistic locking.
   * Previene race condition verificando che la versione sia invariata.
   *
   * @throws ConflictException se il pagamento è stato modificato da un altro utente
   */
  async update(id: number, updatePagamentoDto: UpdatePagamentoDto, utente?: string) {
    const pagamentoCorrente = await this.findOne(id);

    // Estrai la versione dal DTO (deve essere fornita dal client)
    const { version: clientVersion, ...updateData } = updatePagamentoDto as any;

    // Se il client fornisce una versione, verifica che corrisponda
    if (clientVersion !== undefined) {
      if (clientVersion !== pagamentoCorrente.version) {
        throw new ConflictException(
          `Il pagamento è stato modificato da un altro utente. ` +
            `Versione attesa: ${clientVersion}, versione corrente: ${pagamentoCorrente.version}. ` +
            `Ricarica i dati e riprova.`,
        );
      }
    }

    // Prepara i dati per l'update
    const data: any = { ...updateData };
    if (updateData.dataPagamento) {
      data.dataPagamento = new Date(updateData.dataPagamento);
    }

    // Incrementa la versione
    data.version = pagamentoCorrente.version + 1;

    // Usa updateMany con WHERE version per garantire atomicità
    const result = await this.prisma.pagamento.updateMany({
      where: {
        id,
        version: pagamentoCorrente.version, // Solo se la versione è ancora quella attesa
      },
      data,
    });

    // Se nessuna riga è stata aggiornata, c'è stata una race condition
    if (result.count === 0) {
      throw new ConflictException(
        `Il pagamento è stato modificato da un altro utente mentre lo stavi aggiornando. ` +
          `Ricarica i dati e riprova.`,
      );
    }

    const aggiornato = await this.findOne(id);

    await this.audit.registra({
      entita: 'pagamento',
      idEntita: id,
      azione: 'MODIFICA',
      utente,
      datiPrima: istantaneaPagamento(pagamentoCorrente),
      datiDopo: istantaneaPagamento(aggiornato),
      note:
        clientVersion === undefined
          ? 'Modifica senza controllo di versione: il client non ha inviato version'
          : undefined,
    });

    return aggiornato;
  }

  /**
   * Crea pagamenti multipli per tutte le scadenze di un cliente in un dato mese/anno.
   * Utile per segnare come pagati tutti i bolli di un cliente con un'unica azione.
   *
   * BUG FIX: Ora usa transazione per garantire atomicità.
   * Se un pagamento fallisce, tutti vengono annullati per evitare inconsistenze.
   *
   * @param idCliente - ID del cliente
   * @param meseScadenza - Mese di scadenza
   * @param annoScadenza - Anno di scadenza
   * @param dataPagamento - Data del pagamento
   * @param metodoPagamento - Metodo di pagamento (opzionale)
   */
  async createMultiplo(params: {
    idCliente: number;
    meseScadenza: number;
    annoScadenza: number;
    dataPagamento: string;
    metodoPagamento?: string;
    utente?: string;
  }) {
    const { idCliente, meseScadenza, annoScadenza, dataPagamento, metodoPagamento } = params;

    // Trova tutte le scadenze DA_PAGARE per il cliente nel mese/anno specificato
    const scadenzeDaPagare = await this.prisma.scadenza.findMany({
      where: {
        meseScadenza,
        annoScadenza,
        stato: StatoScadenza.DA_PAGARE,
        veicolo: {
          idCliente,
        },
      },
      include: {
        veicolo: {
          include: { cliente: true },
        },
      },
    });

    if (scadenzeDaPagare.length === 0) {
      return {
        pagamentiCreati: 0,
        errori: [],
        message: 'Nessuna scadenza da pagare trovata per questo cliente nel periodo selezionato',
      };
    }

    const risultato = {
      pagamentiCreati: 0,
      errori: [] as string[],
    };

    // Le scadenze senza importo previsto valido NON vengono pagate:
    // registrare un pagamento fittizio (es. 0,01€) falserebbe i report.
    // L'operatore le vede negli errori e le gestisce singolarmente
    // (ricalcolando il bollo o inserendo l'importo a mano).
    const scadenzePagabili: typeof scadenzeDaPagare = [];
    for (const scadenza of scadenzeDaPagare) {
      const importo = scadenza.importoPrevisto?.toNumber() ?? 0;
      if (importo > 0) {
        scadenzePagabili.push(scadenza);
      } else {
        risultato.errori.push(
          `Scadenza ${scadenza.id} (${scadenza.veicolo?.targa}): importo previsto mancante - ` +
          `saltata. Ricalcola il bollo o inserisci l'importo, poi registra il pagamento singolarmente.`
        );
      }
    }

    // Crea pagamenti per ogni scadenza pagabile
    // Non usiamo transazione globale per permettere pagamenti parziali con errori dettagliati
    for (const scadenza of scadenzePagabili) {
      try {
        await this.create(
          {
            idScadenza: scadenza.id,
            dataPagamento,
            importoPagato: scadenza.importoPrevisto!.toNumber(),
            metodoPagamento,
          },
          params.utente,
        );
        risultato.pagamentiCreati++;
      } catch (error) {
        risultato.errori.push(`Scadenza ${scadenza.id} (${scadenza.veicolo?.targa}): ${error.message}`);
      }
    }

    return {
      ...risultato,
      message: `Creati ${risultato.pagamentiCreati} pagamenti su ${scadenzeDaPagare.length} scadenze`,
    };
  }

  async remove(id: number, utente?: string) {
    const pagamento = await this.findOne(id); // Check if exists

    // Quando si elimina un pagamento, riporta la scadenza a DA_PAGARE
    await this.prisma.$transaction(async (prisma) => {
      await prisma.pagamento.delete({
        where: { id },
      });

      // Controlla se ci sono altri pagamenti per questa scadenza
      const altriPagamenti = await prisma.pagamento.count({
        where: { idScadenza: pagamento.idScadenza },
      });

      // Se non ci sono altri pagamenti, riporta lo stato a DA_PAGARE
      if (altriPagamenti === 0) {
        await prisma.scadenza.update({
          where: { id: pagamento.idScadenza },
          data: { stato: StatoScadenza.DA_PAGARE },
        });
      }
    });

    await this.audit.registra({
      entita: 'pagamento',
      idEntita: id,
      azione: 'ELIMINAZIONE',
      utente,
      datiPrima: istantaneaPagamento(pagamento),
      note: 'La scadenza collegata torna DA_PAGARE se non restano altri pagamenti',
    });

    return { message: 'Pagamento eliminato con successo' };
  }
}
