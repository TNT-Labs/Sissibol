import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ScadenzeService } from './scadenze.service';
import { CreateScadenzaDto } from './dto/create-scadenza.dto';
import { UpdateScadenzaDto } from './dto/update-scadenza.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/** Richiesta con l'utente risolto dal JwtAuthGuard, per il registro di audit. */
interface RichiestaAutenticata {
  user?: { email?: string };
}

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

  /**
   * Scadenze di un mese (scadenziario). Senza mese e anno la risposta sarebbe
   * l'intero archivio (oltre 120.000 scadenze con veicolo e cliente): per
   * elenchi più ampi ci sono /scadenze/paginated e i report.
   */
  @Get()
  findAll(
    @Query('stato') stato?: StatoScadenza,
    @Query('idCliente') idCliente?: string,
    @Query('meseScadenza') meseScadenza?: string,
    @Query('annoScadenza') annoScadenza?: string,
  ) {
    const mese = Number(meseScadenza);
    const anno = Number(annoScadenza);
    if (!Number.isInteger(mese) || mese < 1 || mese > 12 || !Number.isInteger(anno) || anno < 1900 || anno > 2200) {
      throw new BadRequestException('Indicare meseScadenza (1-12) e annoScadenza');
    }
    return this.scadenzeService.findAll(stato, idCliente ? parseInt(idCliente, 10) : undefined, mese, anno);
  }

  /**
   * Scadenze non pagate per targa o cliente, per registrare un pagamento.
   * GET /scadenze/cerca?q=rossi AB123&limite=20
   */
  @Get('cerca')
  cerca(@Query('q') q?: unknown, @Query('limite') limite?: string) {
    // Un parametro ripetuto (?q=a&q=b) arriva come array: si usa solo se testo.
    return this.scadenzeService.cercaDaPagare(typeof q === 'string' ? q : undefined, limite ? Number(limite) : undefined);
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

  /**
   * Genera scadenze future per tutti i veicoli fino all'anno specificato.
   * Evita duplicati: non crea scadenze che esistono già.
   *
   * POST /scadenze/genera-future
   * Body: { annoTarget: 2027 }
   *
   * @returns Statistiche sulla generazione (veicoli processati, scadenze create/saltate, errori)
   */
  @Post('genera-future')
  generaScadenzeFuture(@Body() body: { annoTarget: number }) {
    return this.scadenzeService.generaScadenzeFuture(body.annoTarget);
  }

  /**
   * Marca subito come SCADUTO le scadenze DA_PAGARE con mese/anno passato.
   * L'aggiornamento avviene comunque in automatico ogni 6 ore.
   *
   * POST /scadenze/aggiorna-scadute
   */
  @Post('aggiorna-scadute')
  async aggiornaScadute() {
    const aggiornate = await this.scadenzeService.updateScaduteAutomaticamente();
    return { message: `Aggiornate ${aggiornate} scadenze a stato SCADUTO`, aggiornate };
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.scadenzeService.findOne(id);
  }

  @Patch(':id')
  update(
    @Req() req: RichiestaAutenticata,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateScadenzaDto: UpdateScadenzaDto,
  ) {
    return this.scadenzeService.update(id, updateScadenzaDto, req.user?.email);
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
  ricalcolaImporto(
    @Req() req: RichiestaAutenticata,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.scadenzeService.ricalcolaImporto(id, req.user?.email);
  }
}
