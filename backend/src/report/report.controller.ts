import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  Req,
  Res,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { ReportService } from './report.service';
import { formattaNumero, scriviExcel, scriviPdf, type DefinizioneReport } from './formati';
import { type Formato, QueryReportClienti, QueryReportPagamenti, QueryReportScadenze } from './report.dto';

/**
 * Oltre questo numero di righe il PDF (circa 55 righe per pagina) diventa un
 * documento di centinaia di pagine: per quei volumi serve l'Excel.
 */
export const MASSIMO_RIGHE_PDF = 3000;

/** Righe massime di un foglio Excel, con margine per il riepilogo. */
export const MASSIMO_RIGHE_EXCEL = 1_000_000;

const TIPO_MIME: Record<Formato, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

interface RichiestaAutenticata {
  user?: { email?: string };
}

/** Primo giorno (UTC) del mese AAAA-MM. */
function primoDelMese(valore: string): Date {
  const [anno, mese] = valore.split('-').map(Number);
  return new Date(Date.UTC(anno, mese - 1, 1));
}

/** Data AAAA-MM-GG valida (niente 31 febbraio). */
function giorno(valore: string, nome: string): Date {
  const [anno, mese, g] = valore.split('-').map(Number);
  const data = new Date(Date.UTC(anno, mese - 1, g));
  if (data.getUTCMonth() !== mese - 1) throw new BadRequestException(`${nome}: data inesistente`);
  return data;
}

/**
 * Report scaricabili, generati dal server.
 *
 * Il file viene scritto direttamente nella risposta mentre le righe arrivano
 * dal database. Ogni esportazione è annotata nel registro delle modifiche:
 * i report contengono dati personali dei clienti.
 */
@Controller('report')
@UseGuards(JwtAuthGuard)
// Operazioni pesanti: al massimo 10 al minuto per client.
@Throttle({ medium: { limit: 10, ttl: 60000 } })
export class ReportController {
  private readonly logger = new Logger(ReportController.name);

  constructor(
    private readonly report: ReportService,
    private readonly audit: AuditService,
  ) {}

  @Get('scadenze')
  async scadenze(@Query() q: QueryReportScadenze, @Req() req: RichiestaAutenticata, @Res() res: Response) {
    const annoCorrente = new Date().getUTCFullYear();
    const da = q.da ? primoDelMese(q.da) : new Date(Date.UTC(annoCorrente, 0, 1));
    const a = q.a ? primoDelMese(q.a) : new Date(Date.UTC(annoCorrente, 11, 1));
    if (da > a) throw new BadRequestException('Il mese iniziale è successivo a quello finale');

    const filtri = { stato: q.stato, idCliente: q.idCliente, da, a };
    const righe = await this.report.contaScadenze(filtri);
    this.verificaVolume(q.formato, righe);
    await this.invia(res, q.formato, 'scadenze', await this.report.scadenze(filtri), righe, req, {
      stato: q.stato ?? null,
      idCliente: q.idCliente ?? null,
      da: q.da ?? null,
      a: q.a ?? null,
    });
  }

  @Get('pagamenti')
  async pagamenti(@Query() q: QueryReportPagamenti, @Req() req: RichiestaAutenticata, @Res() res: Response) {
    const dal = q.dal ? giorno(q.dal, 'dal') : undefined;
    const al = q.al ? giorno(q.al, 'al') : undefined;
    if (dal && al && dal > al) throw new BadRequestException('La data iniziale è successiva a quella finale');

    const filtri = { dal, al };
    const righe = await this.report.contaPagamenti(filtri);
    this.verificaVolume(q.formato, righe);
    await this.invia(res, q.formato, 'pagamenti', this.report.pagamenti(filtri), righe, req, {
      dal: q.dal ?? null,
      al: q.al ?? null,
    });
  }

  @Get('clienti')
  async clienti(@Query() q: QueryReportClienti, @Req() req: RichiestaAutenticata, @Res() res: Response) {
    const righe = await this.report.contaClienti();
    this.verificaVolume(q.formato, righe);
    await this.invia(res, q.formato, 'clienti', this.report.clienti(), righe, req, {});
  }

  private verificaVolume(formato: Formato, righe: number) {
    if (formato === 'pdf' && righe > MASSIMO_RIGHE_PDF) {
      throw new UnprocessableEntityException(
        `Il report contiene ${formattaNumero(righe)} righe: il PDF è limitato a ` +
          `${formattaNumero(MASSIMO_RIGHE_PDF)}. Restringere i filtri o scegliere Excel.`,
      );
    }
    if (righe > MASSIMO_RIGHE_EXCEL) {
      throw new UnprocessableEntityException('Il report supera il numero massimo di righe di un foglio Excel');
    }
  }

  private async invia<R>(
    res: Response,
    formato: Formato,
    tipo: string,
    definizione: DefinizioneReport<R>,
    righe: number,
    req: RichiestaAutenticata,
    filtri: Record<string, unknown>,
  ) {
    await this.audit.registra({
      entita: 'report',
      idEntita: 0,
      azione: 'ESPORTAZIONE',
      utente: req.user?.email,
      datiDopo: { tipo, formato, righe, filtri },
    });

    const oggi = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', TIPO_MIME[formato]);
    res.setHeader('Content-Disposition', `attachment; filename="report-${tipo}-${oggi}.${formato}"`);
    res.setHeader('Cache-Control', 'no-store');

    try {
      await (formato === 'xlsx' ? scriviExcel(definizione, res) : scriviPdf(definizione, res));
    } catch (errore) {
      // Le intestazioni sono già partite: non si può più rispondere con un
      // errore JSON. Si interrompe la connessione, così il browser non salva
      // un file troncato come se fosse completo.
      this.logger.error(`Report ${tipo} (${formato}) interrotto: ${errore instanceof Error ? errore.message : errore}`);
      res.destroy(errore instanceof Error ? errore : undefined);
    }
  }
}
