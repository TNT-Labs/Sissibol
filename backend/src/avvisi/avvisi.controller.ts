import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AvvisiService, EsitoAvviso } from './avvisi.service';
import { AvvisiInvioService, CONFIGURAZIONE_AVVISI } from './avvisi-invio.service';
import { ConfigurazioneAvvisi } from './configurazione';
import { RimettiInCodaDto } from './dto/rimetti-in-coda.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MailerService } from '../mail/mailer.service';
import { formattaOrario, fusoOrarioApplicazione } from '../mail/fuso-orario';

/** Richiesta con l'utente risolto dal JwtAuthGuard. */
interface RichiestaAutenticata {
  user?: { email?: string };
}

const ESITI: EsitoAvviso[] = ['DA_INVIARE', 'IN_INVIO', 'INVIATO', 'ERRORE', 'ANNULLATO'];

@Controller('avvisi')
@UseGuards(JwtAuthGuard)
export class AvvisiController {
  constructor(
    private readonly avvisiService: AvvisiService,
    private readonly invioService: AvvisiInvioService,
    private readonly mailer: MailerService,
    @Inject(CONFIGURAZIONE_AVVISI) private readonly configurazione: ConfigurazioneAvvisi,
  ) {}

  /** Configurazione dell'invio, conteggi e ultima esecuzione. */
  @Get('stato')
  async stato() {
    const [conteggi, senzaRecapito] = await Promise.all([
      this.avvisiService.conteggi(),
      this.avvisiService.senzaRecapito(),
    ]);
    return {
      smtpConfigurato: this.invioService.smtpConfigurato,
      invioAutomatico: this.configurazione.invioAutomatico,
      orario: formattaOrario(this.configurazione.orario),
      fusoOrario: fusoOrarioApplicazione(),
      maxEmailPerEsecuzione: this.configurazione.maxEmailPerEsecuzione,
      conteggi,
      clientiSenzaRecapito: senzaRecapito.length,
      ultimaEsecuzione: this.invioService.ultimaEsecuzione,
    };
  }

  /** Avvisi per esito (default: da inviare). */
  @Get()
  elenco(@Query('esito') esito?: string, @Query('limite') limite?: string) {
    const scelto = (esito ?? 'DA_INVIARE') as EsitoAvviso;
    if (!ESITI.includes(scelto)) {
      throw new BadRequestException(`Esito non valido: ${esito}`);
    }
    const n = limite ? parseInt(limite, 10) : undefined;
    return this.avvisiService.elenco(scelto, Number.isFinite(n) ? n : undefined);
  }

  /** Avvisi maturati ma non ancora inviati. */
  @Get('in-sospeso')
  inSospeso() {
    return this.avvisiService.inSospeso();
  }

  /** Clienti con scadenze imminenti ma senza un indirizzo email utilizzabile. */
  @Get('senza-recapito')
  senzaRecapito() {
    return this.avvisiService.senzaRecapito();
  }

  /** Storico degli avvisi di una scadenza, compresi quelli da archivio. */
  @Get('scadenza/:idScadenza')
  perScadenza(@Param('idScadenza', ParseIntPipe) idScadenza: number) {
    return this.avvisiService.perScadenza(idScadenza);
  }

  /** Anteprima dell'email, o il contenuto inviato se già partita. */
  @Get(':id/anteprima')
  anteprima(@Param('id', ParseIntPipe) id: number) {
    return this.invioService.anteprima(id);
  }

  /**
   * Matura gli avvisi dovuti per le scadenze imminenti e chiude quelli in coda
   * non più dovuti. Idempotente: rieseguirla non crea doppioni.
   */
  @Post('genera')
  async genera() {
    const esito = await this.avvisiService.generaAvvisiDovuti();
    const riconciliazione = await this.invioService.riconciliaCoda();
    return { ...esito, chiusi: riconciliazione.annullati + riconciliazione.errori };
  }

  /** Invia ora gli avvisi in coda (solo ADMIN: scrive ai clienti). */
  @Post('invia')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  invia() {
    return this.invioService.inviaDovuti();
  }

  /** Verifica connessione e credenziali del server di posta (solo ADMIN). */
  @Get('verifica-smtp')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  verificaSmtp() {
    return this.mailer.verifica();
  }

  /** Rimette in coda avvisi in errore o annullati. */
  @Post('rimetti-in-coda')
  rimettiInCoda(@Body() dto: RimettiInCodaDto, @Req() req: RichiestaAutenticata) {
    return this.avvisiService.rimettiInCoda(dto.ids, req.user?.email);
  }

  /** Annulla un avviso non ancora inviato. */
  @Post(':id/annulla')
  annulla(@Param('id', ParseIntPipe) id: number, @Req() req: RichiestaAutenticata) {
    return this.avvisiService.annulla(id, req.user?.email);
  }
}
