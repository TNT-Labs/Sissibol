import { Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AvvisiService } from './avvisi.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('avvisi')
@UseGuards(JwtAuthGuard)
export class AvvisiController {
  constructor(private readonly avvisiService: AvvisiService) {}

  /** Avvisi maturati ma non ancora inviati. */
  @Get('in-sospeso')
  inSospeso() {
    return this.avvisiService.inSospeso();
  }

  /** Storico degli avvisi di una scadenza, compresi quelli da archivio. */
  @Get('scadenza/:idScadenza')
  perScadenza(@Param('idScadenza', ParseIntPipe) idScadenza: number) {
    return this.avvisiService.perScadenza(idScadenza);
  }

  /**
   * Matura gli avvisi dovuti per le scadenze imminenti.
   * Idempotente: rieseguirla non crea doppioni.
   */
  @Post('genera')
  genera() {
    return this.avvisiService.generaAvvisiDovuti();
  }
}
