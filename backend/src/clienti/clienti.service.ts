import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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
        veicoli: {
          select: {
            id: true,
            targa: true,
          },
        },
        _count: {
          select: { veicoli: true },
        },
      },
      orderBy: [
        { ragioneSociale: 'asc' },
        { cognome: 'asc' },
        { nome: 'asc' },
      ],
    });
  }

  async findAllPaginated(
    page: number = 1,
    pageSize: number = 50,
    search?: string,
    attivo?: boolean,
  ) {
    const skip = (page - 1) * pageSize;

    const where: any = search
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

    // Filtro server-side per stato attivo (undefined = tutti)
    if (attivo !== undefined) {
      where.attivo = attivo;
    }

    const [data, total] = await Promise.all([
      this.prisma.cliente.findMany({
        where,
        select: {
          id: true,
          tipoCliente: true,
          ragioneSociale: true,
          partitaIva: true,
          nome: true,
          cognome: true,
          codiceFiscale: true,
          email: true,
          telefono: true,
          attivo: true,
          _count: {
            select: { veicoli: true },
          },
        },
        orderBy: [
          { ragioneSociale: 'asc' },
          { cognome: 'asc' },
          { nome: 'asc' },
        ],
        skip,
        take: pageSize,
      }),
      this.prisma.cliente.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
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

  /**
   * Soft-delete: disattiva il cliente preservando veicoli, scadenze e
   * pagamenti (dati fiscali). L'eliminazione definitiva è riservata agli
   * ADMIN tramite removeHard.
   */
  async remove(id: number) {
    await this.findOne(id); // Check if exists

    return this.prisma.cliente.update({
      where: { id },
      data: { attivo: false },
    });
  }

  /**
   * Eliminazione definitiva (solo ADMIN): cancella a cascata veicoli,
   * scadenze e pagamenti collegati.
   */
  async removeHard(id: number, isAdmin: boolean) {
    if (!isAdmin) {
      throw new ForbiddenException(
        'Solo gli amministratori possono eliminare definitivamente un cliente',
      );
    }
    await this.findOne(id); // Check if exists

    return this.prisma.cliente.delete({
      where: { id },
    });
  }
}
