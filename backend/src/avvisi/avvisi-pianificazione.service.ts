import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AvvisiService } from './avvisi.service';
import { AvvisiInvioService, CONFIGURAZIONE_AVVISI } from './avvisi-invio.service';
import { ConfigurazioneAvvisi } from './configurazione';
import { formattaOrario, fusoOrarioApplicazione } from '../mail/fuso-orario';

const JOB_AVVISI = 'avvisi-giro-giornaliero';

/**
 * Giro giornaliero degli avvisi.
 *
 * La maturazione gira sempre: registra soltanto quali avvisi sono dovuti, e
 * rende visibile la coda anche prima di attivare l'invio. L'invio parte da
 * solo solo con AVVISI_INVIO_AUTOMATICO=true e il server di posta
 * configurato; altrimenti lo avvia un amministratore dalla pagina Avvisi.
 */
@Injectable()
export class AvvisiPianificazioneService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AvvisiPianificazioneService.name);

  constructor(
    private avvisi: AvvisiService,
    private invio: AvvisiInvioService,
    private schedulerRegistry: SchedulerRegistry,
    @Inject(CONFIGURAZIONE_AVVISI) private configurazione: ConfigurazioneAvvisi,
  ) {}

  onModuleInit() {
    const { orario } = this.configurazione;
    const fuso = fusoOrarioApplicazione();
    const job = new CronJob(`${orario.minuti} ${orario.ora} * * *`, () => {
      void this.giroGiornaliero();
    }, null, false, fuso);
    this.schedulerRegistry.addCronJob(JOB_AVVISI, job);
    job.start();

    const invio = !this.configurazione.invioAutomatico
      ? 'invio manuale (AVVISI_INVIO_AUTOMATICO non attivo)'
      : this.invio.smtpConfigurato
        ? 'invio automatico'
        : 'invio automatico richiesto ma server di posta non configurato';
    this.logger.log(`Avvisi: giro giornaliero alle ${formattaOrario(orario)} (${fuso}), ${invio}`);
  }

  onModuleDestroy() {
    if (this.schedulerRegistry.doesExist('cron', JOB_AVVISI)) {
      this.schedulerRegistry.deleteCronJob(JOB_AVVISI);
    }
  }

  async giroGiornaliero() {
    try {
      await this.avvisi.generaAvvisiDovuti();
      if (this.configurazione.invioAutomatico && this.invio.smtpConfigurato) {
        await this.invio.inviaDovuti();
      } else {
        // Senza invio la coda va comunque tenuta pulita.
        await this.invio.riconciliaCoda();
      }
    } catch (error) {
      this.logger.error(`Errore nel giro giornaliero degli avvisi: ${(error as Error).message}`);
    }
  }
}
