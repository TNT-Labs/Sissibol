import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScadenzaDto } from './dto/create-scadenza.dto';
import { UpdateScadenzaDto } from './dto/update-scadenza.dto';
import { StatoScadenza } from '@prisma/client';

@Injectable()
export class ScadenzeService {
  constructor(private prisma: PrismaService) {}

  async create(createScadenzaDto: CreateScadenzaDto) {
    return this.prisma.scadenza.create({
      data: {
        ...createScadenzaDto,
        dataScadenza: new Date(createScadenzaDto.dataScadenza),
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

    const data: any = { ...updateScadenzaDto };
    if (updateScadenzaDto.dataScadenza) {
      data.dataScadenza = new Date(updateScadenzaDto.dataScadenza);
    }

    return this.prisma.scadenza.update({
      where: { id },
      data,
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
  async updateScaduteAutomaticamente() {
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);

    await this.prisma.scadenza.updateMany({
      where: {
        dataScadenza: {
          lt: oggi,
        },
        stato: StatoScadenza.DA_PAGARE,
      },
      data: {
        stato: StatoScadenza.SCADUTO,
      },
    });
  }

  // Ottieni scadenze in scadenza (per notifiche)
  async getScadenzeInScadenza(giorniAnticipo: number = 30) {
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);

    const dataLimite = new Date(oggi);
    dataLimite.setDate(dataLimite.getDate() + giorniAnticipo);

    return this.prisma.scadenza.findMany({
      where: {
        dataScadenza: {
          gte: oggi,
          lte: dataLimite,
        },
        stato: StatoScadenza.DA_PAGARE,
      },
      include: {
        veicolo: {
          include: {
            cliente: true,
          },
        },
      },
      orderBy: {
        dataScadenza: 'asc',
      },
    });
  }
}
