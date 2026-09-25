import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUtenteDto } from './dto/create-utente.dto';
import { UpdateUtenteDto } from './dto/update-utente.dto';
import * as bcrypt from 'bcryptjs';
import { problemiPassword } from '../auth/politica-password';

@Injectable()
export class UtentiService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.utente.findMany({
      select: {
        id: true,
        email: true,
        ruolo: true,
        deveCambiarePassword: true,
        bloccatoFinoA: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { email: 'asc' },
    });
  }

  async findOne(id: number) {
    const utente = await this.prisma.utente.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        ruolo: true,
        deveCambiarePassword: true,
        bloccatoFinoA: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!utente) {
      throw new NotFoundException(`Utente con ID ${id} non trovato`);
    }

    return utente;
  }

  async create(createUtenteDto: CreateUtenteDto) {
    // Verifica se l'email esiste già
    const existingUser = await this.prisma.utente.findUnique({
      where: { email: createUtenteDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email già registrata');
    }

    const problemi = problemiPassword(createUtenteDto.password, createUtenteDto.email);
    if (problemi.length) {
      throw new BadRequestException(`Password non abbastanza sicura: ${problemi.join('; ')}`);
    }

    // Hash della password
    const hashedPassword = await bcrypt.hash(createUtenteDto.password, 12);

    const utente = await this.prisma.utente.create({
      data: {
        email: createUtenteDto.email,
        password: hashedPassword,
        ruolo: createUtenteDto.ruolo,
        // La password l'ha scelta l'amministratore: l'utente deve cambiarla.
        deveCambiarePassword: true,
      },
      select: {
        id: true,
        email: true,
        ruolo: true,
        deveCambiarePassword: true,
        bloccatoFinoA: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return utente;
  }

  async update(id: number, updateUtenteDto: UpdateUtenteDto, currentUserId?: number) {
    // Verifica che l'utente esista
    const attuale = await this.findOne(id);

    // La propria password si cambia solo conoscendo quella attuale
    // (/auth/change-password): una sessione rubata non deve bastare.
    if (updateUtenteDto.password && id === currentUserId) {
      throw new BadRequestException('Per cambiare la tua password usa "Cambia password" dal menu utente');
    }

    // Senza amministratori nessuno potrebbe più gestire utenti e configurazioni.
    if (attuale.ruolo === 'ADMIN' && updateUtenteDto.ruolo && updateUtenteDto.ruolo !== 'ADMIN') {
      const amministratori = await this.prisma.utente.count({ where: { ruolo: 'ADMIN' } });
      if (amministratori <= 1) {
        throw new BadRequestException('Non puoi togliere il ruolo all\'ultimo amministratore del sistema');
      }
    }

    // Se si sta aggiornando l'email, verifica che non sia già in uso
    if (updateUtenteDto.email) {
      const existingUser = await this.prisma.utente.findFirst({
        where: {
          email: updateUtenteDto.email,
          id: { not: id },
        },
      });

      if (existingUser) {
        throw new ConflictException('Email già in uso da un altro utente');
      }
    }

    // Prepara i dati per l'aggiornamento
    const updateData: any = {};

    if (updateUtenteDto.email) {
      updateData.email = updateUtenteDto.email;
    }

    if (updateUtenteDto.ruolo) {
      updateData.ruolo = updateUtenteDto.ruolo;
    }

    if (updateUtenteDto.password) {
      const email = updateUtenteDto.email ?? attuale.email;
      const problemi = problemiPassword(updateUtenteDto.password, email);
      if (problemi.length) {
        throw new BadRequestException(`Password non abbastanza sicura: ${problemi.join('; ')}`);
      }
      updateData.password = await bcrypt.hash(updateUtenteDto.password, 12);
      // Password reimpostata dall'amministratore: l'utente deve cambiarla, e
      // le sessioni aperte con la vecchia password vengono chiuse.
      updateData.deveCambiarePassword = true;
      updateData.tentativiFalliti = 0;
      updateData.bloccatoFinoA = null;
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return this.prisma.utente.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        ruolo: true,
        deveCambiarePassword: true,
        bloccatoFinoA: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: number, currentUserId: number) {
    // Verifica che l'utente esista
    await this.findOne(id);

    // Impedisce all'utente di eliminare se stesso
    if (id === currentUserId) {
      throw new BadRequestException('Non puoi eliminare il tuo stesso account');
    }

    // Verifica che non sia l'ultimo admin
    const utente = await this.prisma.utente.findUnique({
      where: { id },
    });

    if (utente?.ruolo === 'ADMIN') {
      const adminCount = await this.prisma.utente.count({
        where: { ruolo: 'ADMIN' },
      });

      if (adminCount <= 1) {
        throw new BadRequestException(
          'Non puoi eliminare l\'ultimo amministratore del sistema',
        );
      }
    }

    await this.prisma.utente.delete({
      where: { id },
    });

    return { message: 'Utente eliminato con successo' };
  }
}
