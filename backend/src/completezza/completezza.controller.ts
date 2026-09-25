import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompletezzaService, FiltroStato } from './completezza.service';
import { ImpostaCampoDto } from './dto/imposta-campo.dto';
import { VeicoliService } from '../veicoli/veicoli.service';

const STATI: FiltroStato[] = ['DA_COMPLETARE', 'CONSIGLIATI', 'TUTTI'];

function intero(valore: string | undefined, nome: string): number | undefined {
  if (valore === undefined || valore === '') return undefined;
  const n = Number(valore);
  if (!Number.isInteger(n)) throw new BadRequestException(`${nome} deve essere un numero intero`);
  return n;
}

@Controller('completezza')
@UseGuards(JwtAuthGuard)
export class CompletezzaController {
  constructor(
    private readonly completezza: CompletezzaService,
    private readonly veicoli: VeicoliService,
  ) {}

  /**
   * Rapporto di completezza dei dati dei veicoli e lista di lavoro.
   * GET /completezza?stato=DA_COMPLETARE&campo=potenzaKw&cerca=AB123&pagina=1
   */
  @Get()
  elenco(
    @Query('stato') stato?: string,
    @Query('campo') campo?: string,
    @Query('cerca') cerca?: string,
    @Query('idCliente') idCliente?: string,
    @Query('periodicita') periodicita?: string,
    @Query('pagina') pagina?: string,
    @Query('perPagina') perPagina?: string,
  ) {
    if (stato !== undefined && !STATI.includes(stato as FiltroStato)) {
      throw new BadRequestException(`stato deve essere uno fra ${STATI.join(', ')}`);
    }
    if (periodicita !== undefined && periodicita !== 'ANNUALE' && periodicita !== 'QUADRIMESTRALE') {
      throw new BadRequestException('periodicita deve essere ANNUALE o QUADRIMESTRALE');
    }
    return this.completezza.elenco({
      stato: stato as FiltroStato | undefined,
      campo: campo || undefined,
      cerca: cerca || undefined,
      idCliente: intero(idCliente, 'idCliente'),
      periodicita: periodicita as 'ANNUALE' | 'QUADRIMESTRALE' | undefined,
      pagina: intero(pagina, 'pagina'),
      perPagina: intero(perPagina, 'perPagina'),
    });
  }

  /** Cosa manca a un veicolo, con i valori attuali dei campi di calcolo. */
  @Get('veicolo/:id')
  veicolo(@Param('id', ParseIntPipe) id: number) {
    return this.completezza.veicolo(id);
  }

  /**
   * Imposta lo stesso valore di un campo a dominio chiuso su più veicoli.
   * POST /completezza/imposta { idVeicoli, campo, valore }
   */
  @Post('imposta')
  imposta(@Body() dto: ImpostaCampoDto, @Req() req: { user?: { email?: string } }) {
    return this.veicoli.impostaCampo(dto.idVeicoli, dto.campo, dto.valore, req.user?.email);
  }
}
