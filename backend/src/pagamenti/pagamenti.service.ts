import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePagamentoDto } from './dto/create-pagamento.dto';
import { UpdatePagamentoDto } from './dto/update-pagamento.dto';
import { StatoScadenza } from '../prisma/types';

@Injectable()
export class PagamentiService {
  constructor(private prisma: PrismaService) {}

  async create(createPagamentoDto: CreatePagamentoDto) {
    // Crea il pagamento e aggiorna lo stato della scadenza in una transazione
    const result = await this.prisma.$transaction(async (prisma) => {
      const pagamento = await prisma.pagamento.create({
        data: {
          ...createPagamentoDto,
          dataPagamento: new Date(createPagamentoDto.dataPagamento),
        },
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

      // Aggiorna lo stato della scadenza a PAGATO
      await prisma.scadenza.update({
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
