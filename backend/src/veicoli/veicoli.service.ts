import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVeicoloDto } from './dto/create-veicolo.dto';
import { UpdateVeicoloDto } from './dto/update-veicolo.dto';

// Tipi per lo storico veicolo (corrispondono all'enum nel schema.prisma)
type TipoModificaVeicolo = 'CAMBIO_TARGA' | 'CAMBIO_PROPRIETARIO' | 'CAMBIO_TARGA_E_PROPRIETARIO';

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
          orderBy: [
            { annoScadenza: 'desc' },
            { meseScadenza: 'desc' },
          ],
        },
      },
    });

    if (!veicolo) {
      throw new NotFoundException(`Veicolo con ID ${id} non trovato`);
    }

    return veicolo;
  }

  /**
   * Aggiorna un veicolo tracciando le modifiche a targa e proprietario.
   *
   * @param id - ID del veicolo
   * @param updateVeicoloDto - Dati da aggiornare
   * @param utenteEmail - Email utente per audit (opzionale)
   * @param motivazione - Motivo della modifica (opzionale)
   */
  async update(
    id: number,
    updateVeicoloDto: UpdateVeicoloDto,
    utenteEmail?: string,
    motivazione?: string,
  ) {
    const veicoloCorrente = await this.findOne(id);

    // Rileva cambiamenti significativi
    const cambioTarga =
      updateVeicoloDto.targa !== undefined &&
      updateVeicoloDto.targa !== veicoloCorrente.targa;

    const cambioProprietario =
      updateVeicoloDto.idCliente !== undefined &&
      updateVeicoloDto.idCliente !== veicoloCorrente.idCliente;

    // Se ci sono cambiamenti significativi, usa una transazione
    if (cambioTarga || cambioProprietario) {
      return this.prisma.$transaction(async (tx) => {
        // Determina il tipo di modifica
        let tipoModifica: TipoModificaVeicolo;
        if (cambioTarga && cambioProprietario) {
          tipoModifica = 'CAMBIO_TARGA_E_PROPRIETARIO';
        } else if (cambioTarga) {
          tipoModifica = 'CAMBIO_TARGA';
        } else {
          tipoModifica = 'CAMBIO_PROPRIETARIO';
        }

        // Registra lo storico
        await tx.storicoVeicolo.create({
          data: {
            idVeicolo: id,
            tipoModifica,
            targaPrecedente: cambioTarga ? veicoloCorrente.targa : null,
            targaNuova: cambioTarga ? updateVeicoloDto.targa : null,
            idClientePrecedente: cambioProprietario
              ? veicoloCorrente.idCliente
              : null,
            idClienteNuovo: cambioProprietario
              ? updateVeicoloDto.idCliente
              : null,
            motivazione: motivazione || null,
            utenteModifica: utenteEmail || null,
          },
        });

        // Aggiorna il veicolo
        return tx.veicolo.update({
          where: { id },
          data: updateVeicoloDto,
          include: {
            cliente: true,
          },
        });
      });
    }

    // Nessun cambio significativo: update semplice
    return this.prisma.veicolo.update({
      where: { id },
      data: updateVeicoloDto,
      include: {
        cliente: true,
      },
    });
  }

  /**
   * Recupera lo storico modifiche di un veicolo
   */
  async getStorico(idVeicolo: number) {
    await this.findOne(idVeicolo); // Check if exists

    return this.prisma.storicoVeicolo.findMany({
      where: { idVeicolo },
      orderBy: { dataModifica: 'desc' },
    });
  }

  async remove(id: number) {
    await this.findOne(id); // Check if exists

    return this.prisma.veicolo.delete({
      where: { id },
    });
  }
}
