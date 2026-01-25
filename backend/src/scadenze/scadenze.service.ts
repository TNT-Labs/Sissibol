import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScadenzaDto } from './dto/create-scadenza.dto';
import { UpdateScadenzaDto } from './dto/update-scadenza.dto';
import { StatoScadenza, Periodicita } from '@prisma/client';

@Injectable()
export class ScadenzeService {
  constructor(private prisma: PrismaService) {}

  // Utility: ottiene l'ultimo giorno del mese
  private getUltimoGiornoMese(anno: number, mese: number): Date {
    // mese è 1-12, Date usa 0-11, quindi mese senza -1 dà il primo giorno del mese successivo
    // sottraendo 1 giorno otteniamo l'ultimo giorno del mese desiderato
    return new Date(anno, mese, 0);
  }

  // Utility: ottiene il primo giorno del mese
  private getPrimoGiornoMese(anno: number, mese: number): Date {
    return new Date(anno, mese - 1, 1);
  }

  async create(createScadenzaDto: CreateScadenzaDto) {
    return this.prisma.scadenza.create({
      data: {
        idVeicolo: createScadenzaDto.idVeicolo,
        meseScadenza: createScadenzaDto.meseScadenza,
        annoScadenza: createScadenzaDto.annoScadenza,
        periodicita: createScadenzaDto.periodicita || Periodicita.ANNUALE,
        importoPrevisto: createScadenzaDto.importoPrevisto,
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

  async findAll(stato?: StatoScadenza, idCliente?: number) {
    // Prima aggiorniamo tutte le scadenze scadute
    await this.updateScaduteAutomaticamente();

    const where: any = {};

    if (stato) {
      where.stato = stato;
    }

    if (idCliente) {
      where.veicolo = {
        idCliente: idCliente,
      };
    }

    return this.prisma.scadenza.findMany({
      where,
      include: {
        veicolo: {
          include: {
            cliente: true,
          },
        },
        pagamenti: true,
      },
      orderBy: {
        dataScadenza: 'desc',
      },
    });
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

  // Aggiorna automaticamente le scadenze scadute
  // Una scadenza è scaduta se siamo oltre l'ultimo giorno del mese di scadenza
  async updateScaduteAutomaticamente() {
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const meseCorrente = oggi.getMonth() + 1; // 1-12
    const annoCorrente = oggi.getFullYear();

    // Trova tutte le scadenze DA_PAGARE e verifica se sono scadute
    const scadenzeDaPagare = await this.prisma.scadenza.findMany({
      where: {
        stato: StatoScadenza.DA_PAGARE,
      },
    });

    const idsScadute: number[] = [];
    for (const scadenza of scadenzeDaPagare) {
      const ultimoGiorno = this.getUltimoGiornoMese(scadenza.annoScadenza, scadenza.meseScadenza);
      // Se oggi è dopo l'ultimo giorno del mese di scadenza, la scadenza è scaduta
      if (oggi > ultimoGiorno) {
        idsScadute.push(scadenza.id);
      }
    }

    if (idsScadute.length > 0) {
      await this.prisma.scadenza.updateMany({
        where: {
          id: { in: idsScadute },
        },
        data: {
          stato: StatoScadenza.SCADUTO,
        },
      });
    }
  }

  // Ottieni scadenze in scadenza (per notifiche)
  // Una scadenza è "in scadenza" se il suo mese di scadenza cade entro i prossimi N giorni
  async getScadenzeInScadenza(giorniAnticipo: number = 30) {
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const meseCorrente = oggi.getMonth() + 1;
    const annoCorrente = oggi.getFullYear();

    const dataLimite = new Date(oggi);
    dataLimite.setDate(dataLimite.getDate() + giorniAnticipo);
    const meseLimite = dataLimite.getMonth() + 1;
    const annoLimite = dataLimite.getFullYear();

    // Trova tutte le scadenze DA_PAGARE
    const scadenzeDaPagare = await this.prisma.scadenza.findMany({
      where: {
        stato: StatoScadenza.DA_PAGARE,
      },
      include: {
        veicolo: {
          include: {
            cliente: true,
          },
        },
      },
    });

    // Filtra quelle che scadono entro il periodo
    const scadenzeInScadenza = scadenzeDaPagare.filter((scadenza) => {
      const primoGiornoMese = this.getPrimoGiornoMese(scadenza.annoScadenza, scadenza.meseScadenza);
      const ultimoGiornoMese = this.getUltimoGiornoMese(scadenza.annoScadenza, scadenza.meseScadenza);

      // La scadenza è "in scadenza" se:
      // - Il mese di scadenza non è ancora passato (ultimo giorno >= oggi)
      // - Il primo giorno del mese di scadenza è entro il limite
      return ultimoGiornoMese >= oggi && primoGiornoMese <= dataLimite;
    });

    // Ordina per anno e mese
    return scadenzeInScadenza.sort((a, b) => {
      if (a.annoScadenza !== b.annoScadenza) {
        return a.annoScadenza - b.annoScadenza;
      }
      return a.meseScadenza - b.meseScadenza;
    });
  }
}
