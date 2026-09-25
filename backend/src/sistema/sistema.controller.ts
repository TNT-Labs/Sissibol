import { Controller, Get, HttpCode, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SistemaService } from './sistema.service';

@Controller()
export class SistemaController {
  constructor(private readonly sistema: SistemaService) {}

  /**
   * Controllo di salute per Docker e monitoraggio: pubblico, senza dati.
   * 200 se l'applicazione risponde e raggiunge il database, altrimenti 503.
   */
  @Get('health')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async salute(@Res({ passthrough: true }) res: Response) {
    const database = await this.sistema.databaseRaggiungibile();
    if (!database) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { stato: database ? 'ok' : 'errore', database: database ? 'ok' : 'non raggiungibile' };
  }

  /** Stato dell'installazione per gli amministratori: database, backup, posta. */
  @Get('sistema/stato')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  stato() {
    return this.sistema.stato();
  }
}
