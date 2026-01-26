import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePagamentoDto } from './dto/create-pagamento.dto';
import { UpdatePagamentoDto } from './dto/update-pagamento.dto';
import { StatoScadenza } from '../prisma/types';
import { BolloService } from '../bollo/bollo.service';

@Injectable()
export class PagamentiService {
  constructor(
    private prisma: PrismaService,
    private bolloService: BolloService,
  ) {}

  /**
   * Crea un pagamento con snapshot immutabile del calcolo bollo.
   * Lo snapshot preserva le tariffe applicate per i report storici.
   */
  async create(createPagamentoDto: CreatePagamentoDto) {
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

    // Calcola il bollo per ottenere lo snapshot delle tariffe
    let calcoloBollo;
    let configurazioneId = 0;

    try {
      calcoloBollo = await this.bolloService.calcolaBollo(
        scadenza.idVeicolo,
        scadenza.annoScadenza,
        scadenza.periodicita as 'ANNUALE' | 'QUADRIMESTRALE',
      );

      // Recupera l'ID configurazione usata
      const configurazione = await this.prisma.configurazioneBollo.findFirst({
        where: {
          annoValidita: scadenza.annoScadenza,
          regione: scadenza.veicolo.regione || 'Lombardia',
          attivo: true,
        },
      });

      if (!configurazione) {
        // Prova con DEFAULT
        const configDefault = await this.prisma.configurazioneBollo.findFirst({
          where: {
            annoValidita: scadenza.annoScadenza,
            regione: 'DEFAULT',
            attivo: true,
          },
        });
        configurazioneId = configDefault?.id || 0;
      } else {
        configurazioneId = configurazione.id;
      }
    } catch (error) {
      // Se il calcolo fallisce, crea comunque il pagamento senza snapshot
      console.warn(`Impossibile calcolare snapshot bollo: ${error.message}`);
      calcoloBollo = null;
    }

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
              potenzaKw: scadenza.veicolo.potenzaKw?.toString(),
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
            // Riferimento configurazione per audit
            idConfigurazione: configurazioneId,
            annoConfigurazione: scadenza.annoScadenza,
            regioneConfigurazione: scadenza.veicolo.regione || 'DEFAULT',
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

  async update(id: number, updatePagamentoDto: UpdatePagamentoDto) {
    await this.findOne(id); // Check if exists

    const data: any = { ...updatePagamentoDto };
    if ((updatePagamentoDto as any).dataPagamento) {
      data.dataPagamento = new Date((updatePagamentoDto as any).dataPagamento);
    }

    return this.prisma.pagamento.update({
      where: { id },
      data,
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
  }

  async remove(id: number) {
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

    return { message: 'Pagamento eliminato con successo' };
  }
}
