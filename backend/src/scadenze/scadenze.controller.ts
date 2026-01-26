import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ScadenzeService } from './scadenze.service';
import { CreateScadenzaDto } from './dto/create-scadenza.dto';
import { UpdateScadenzaDto } from './dto/update-scadenza.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// Definiamo il tipo localmente
type StatoScadenza = 'DA_PAGARE' | 'PAGATO' | 'SCADUTO';

@Controller('scadenze')
@UseGuards(JwtAuthGuard)
export class ScadenzeController {
  constructor(private readonly scadenzeService: ScadenzeService) {}

  @Post()
  create(@Body() createScadenzaDto: CreateScadenzaDto) {
    return this.scadenzeService.create(createScadenzaDto);
  }

  @Get()
  findAll(
    @Query('stato') stato?: StatoScadenza,
    @Query('idCliente') idCliente?: string,
  ) {
    const parsedIdCliente = idCliente ? parseInt(idCliente, 10) : undefined;
    return this.scadenzeService.findAll(stato, parsedIdCliente);
  }

  /**
   * Versione paginata per report e export di grandi dataset.
   * Previene memory overflow caricando i dati in chunk.
   *
   * GET /scadenze/paginated?page=1&pageSize=100&stato=DA_PAGARE&idCliente=1&annoFrom=2024&annoTo=2026
   */
  @Get('paginated')
  findAllPaginated(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('stato') stato?: StatoScadenza,
    @Query('idCliente') idCliente?: string,
    @Query('annoFrom') annoFrom?: string,
    @Query('annoTo') annoTo?: string,
  ) {
    return this.scadenzeService.findAllPaginated({
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 100,
      stato,
      idCliente: idCliente ? parseInt(idCliente, 10) : undefined,
      annoFrom: annoFrom ? parseInt(annoFrom, 10) : undefined,
      annoTo: annoTo ? parseInt(annoTo, 10) : undefined,
    });
  }

  /**
   * Statistiche aggregate per scadenze (per dashboard).
   * Più efficiente di caricare tutti i dati.
   *
   * GET /scadenze/stats?idCliente=1
   */
  @Get('stats')
  getStats(@Query('idCliente') idCliente?: string) {
    return this.scadenzeService.getStatsCounts(
      idCliente ? parseInt(idCliente, 10) : undefined,
    );
  }

  @Get('in-scadenza')
  getScadenzeInScadenza(@Query('giorni') giorni?: string) {
    const parsedGiorni = giorni ? parseInt(giorni, 10) : undefined;
    return this.scadenzeService.getScadenzeInScadenza(parsedGiorni);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.scadenzeService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateScadenzaDto: UpdateScadenzaDto,
  ) {
    return this.scadenzeService.update(id, updateScadenzaDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.scadenzeService.remove(id);
  }

  /**
   * Ricalcola l'importo di una scadenza in base alle tariffe configurate
   * POST /scadenze/:id/ricalcola
   */
  @Post(':id/ricalcola')
  ricalcolaImporto(@Param('id', ParseIntPipe) id: number) {
    return this.scadenzeService.ricalcolaImporto(id);
  }
}
