import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Injectable()
export class ClientiService {
  constructor(private prisma: PrismaService) {}

  async create(createClienteDto: CreateClienteDto) {
    return this.prisma.cliente.create({
      data: createClienteDto,
    });
  }

  async findAll(search?: string) {
    const where = search
      ? {
          OR: [
            { ragioneSociale: { contains: search, mode: 'insensitive' as const } },
            { nome: { contains: search, mode: 'insensitive' as const } },
            { cognome: { contains: search, mode: 'insensitive' as const } },
            { partitaIva: { contains: search, mode: 'insensitive' as const } },
            { codiceFiscale: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    return this.prisma.cliente.findMany({
      where,
      include: {
        veicoli: true,
      },
      orderBy: [
        { ragioneSociale: 'asc' },
        { cognome: 'asc' },
        { nome: 'asc' },
      ],
    });
  }

  async findOne(id: number) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      include: {
        veicoli: {
          include: {
            scadenze: {
              orderBy: [
                { annoScadenza: 'desc' },
                { meseScadenza: 'desc' },
              ],
            },
          },
        },
      },
    });

    if (!cliente) {
      throw new NotFoundException(`Cliente con ID ${id} non trovato`);
    }

    return cliente;
  }

  async update(id: number, updateClienteDto: UpdateClienteDto) {
    await this.findOne(id); // Check if exists

    return this.prisma.cliente.update({
      where: { id },
      data: updateClienteDto,
    });
  }

  async remove(id: number) {
    await this.findOne(id); // Check if exists

    return this.prisma.cliente.delete({
      where: { id },
    });
  }
}
