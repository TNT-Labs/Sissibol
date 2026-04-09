import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { BolloService } from './bollo.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TariffeService } from './tariffe.service';

@Controller('bollo')
@UseGuards(JwtAuthGuard)
export class BolloController {
  constructor(
    private readonly bolloService: BolloService,
    private readonly tariffeService: TariffeService,
  ) {}

  /**
   * Calcola il bollo per un veicolo specifico
   * GET /bollo/calcola/:idVeicolo?anno=2026&periodicita=ANNUALE
   */
  @Get('calcola/:idVeicolo')
  async calcolaBollo(
    @Param('idVeicolo', ParseIntPipe) idVeicolo: number,
    @Query('anno') anno?: string,
    @Query('periodicita') periodicita?: 'ANNUALE' | 'QUADRIMESTRALE',
  ) {
    const annoCorrente = new Date().getFullYear();
    const annoNum = anno ? parseInt(anno, 10) : annoCorrente;
    const annoValido = Number.isFinite(annoNum) && annoNum >= 2000 && annoNum <= 2100
      ? annoNum
      : annoCorrente;
    return this.bolloService.calcolaBollo(
      idVeicolo,
      annoValido,
      periodicita || 'ANNUALE',
    );
  }

  /**
   * Calcola il bollo per tutti i veicoli di un cliente
   * GET /bollo/cliente/:idCliente?anno=2026
   */
  @Get('cliente/:idCliente')
  async calcolaBolloCliente(
    @Param('idCliente', ParseIntPipe) idCliente: number,
    @Query('anno') anno?: string,
  ) {
    const annoCorrente = new Date().getFullYear();
    const annoNum = anno ? parseInt(anno, 10) : annoCorrente;
    const annoValido = Number.isFinite(annoNum) && annoNum >= 2000 && annoNum <= 2100
      ? annoNum
      : annoCorrente;
    return this.bolloService.calcolaBolloPerCliente(idCliente, annoValido);
  }

  /**
   * Aggiorna gli importi di tutte le scadenze future di un veicolo
   * POST /bollo/aggiorna-scadenze/:idVeicolo
   */
  @Post('aggiorna-scadenze/:idVeicolo')
  async aggiornaScadenze(@Param('idVeicolo', ParseIntPipe) idVeicolo: number) {
    const aggiornate = await this.bolloService.aggiornaImportiScadenze(idVeicolo);
    return { message: `Aggiornate ${aggiornate} scadenze`, aggiornate };
  }

  // =====================================================
  // GESTIONE CONFIGURAZIONI TARIFFE
  // =====================================================

  /**
   * Ottieni tutte le configurazioni tariffe
   * GET /bollo/configurazioni
   */
  @Get('configurazioni')
  async getConfigurazioni() {
    return this.tariffeService.getConfigurazioni();
  }

  /**
   * Ottieni una configurazione specifica con tutte le tariffe
   * GET /bollo/configurazioni/:id
   */
  @Get('configurazioni/:id')
  async getConfigurazione(@Param('id', ParseIntPipe) id: number) {
    return this.tariffeService.getConfigurazione(id);
  }

  /**
   * Crea una nuova configurazione
   * POST /bollo/configurazioni
   */
  @Post('configurazioni')
  async createConfigurazione(
    @Body()
    data: {
      annoValidita: number;
      regione: string;
      scontoRid?: number;
      note?: string;
    },
  ) {
    return this.tariffeService.createConfigurazione(data);
  }

  /**
   * Duplica una configurazione esistente per un nuovo anno
   * POST /bollo/configurazioni/:id/duplica
   */
  @Post('configurazioni/:id/duplica')
  async duplicaConfigurazione(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: { nuovoAnno: number },
  ) {
    return this.tariffeService.duplicaConfigurazione(id, data.nuovoAnno);
  }

  /**
   * Ottieni le tariffe di una configurazione
   * GET /bollo/configurazioni/:id/tariffe
   */
  @Get('configurazioni/:id/tariffe')
  async getTariffe(@Param('id', ParseIntPipe) idConfigurazione: number) {
    return this.tariffeService.getTariffe(idConfigurazione);
  }

  /**
   * Aggiorna una tariffa
   * POST /bollo/tariffe/:id
   */
  @Post('tariffe/:id')
  async updateTariffa(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    data: {
      importoUnitario?: number;
      importoFisso?: number;
      descrizione?: string;
    },
  ) {
    return this.tariffeService.updateTariffa(id, data);
  }

  /**
   * Crea una nuova tariffa
   * POST /bollo/configurazioni/:id/tariffe
   */
  @Post('configurazioni/:id/tariffe')
  async createTariffa(
    @Param('id', ParseIntPipe) idConfigurazione: number,
    @Body()
    data: {
      tipoVeicolo: string;
      categoriaEuro?: string;
      unitaMisura: string;
      sogliaMin?: number;
      sogliaMax?: number;
      importoUnitario: number;
      importoFisso?: number;
      tipoSospensione?: string;
      periodicita?: string;
      descrizione?: string;
    },
  ) {
    return this.tariffeService.createTariffa(idConfigurazione, data);
  }
}
