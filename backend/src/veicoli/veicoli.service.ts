import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVeicoloDto } from './dto/create-veicolo.dto';
import { UpdateVeicoloDto } from './dto/update-veicolo.dto';

@Injectable()
export class VeicoliService {
  constructor(private prisma: PrismaService) {}

  async create(createVeicoloDto: CreateVeicoloDto) {
    return this.prisma.veicolo.create({
      data: createVeicoloDto,
      include: {
        cliente: true,
      },
    });
  }

  async findAll(idCliente?: number) {
    const where = idCliente ? { idCliente } : {};

    return this.prisma.veicolo.findMany({
      where,
      include: {
        cliente: true,
        scadenze: {
          orderBy: [
            { annoScadenza: 'desc' },
            { meseScadenza: 'desc' },
          ],
        },
      },
      orderBy: {
        targa: 'asc',
      },
    });
  }

  async findOne(id: number) {
    const veicolo = await this.prisma.veicolo.findUnique({
      where: { id },
      include: {
        cliente: true,
        scadenze: {
          include: {
            pagamenti: true,
          },
          orderBy: {
            dataScadenza: 'desc',
          },
        },
      },
    });

    if (!veicolo) {
      throw new NotFoundException(`Veicolo con ID ${id} non trovato`);
    }

    return veicolo;
  }

  async update(id: number, updateVeicoloDto: UpdateVeicoloDto) {
    await this.findOne(id); // Check if exists

    return this.prisma.veicolo.update({
      where: { id },
      data: updateVeicoloDto,
      include: {
        cliente: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id); // Check if exists

    return this.prisma.veicolo.delete({
      where: { id },
    });
  }
}
