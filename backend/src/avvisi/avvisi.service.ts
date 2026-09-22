import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScadenzeService } from '../scadenze/scadenze.service';

/**
 * Giorni di anticipo con cui matura ciascun tipo di avviso.
 * Allineati alla pratica dell'archivio storico: un primo avviso con circa un
 * mese di anticipo e un secondo a ridosso della scadenza.
 */
export const ANTICIPO_AVVISI: Record<'PRIMO' | 'SECONDO', number> = {
  PRIMO: 30,
  SECONDO: 7,
};

export interface EsitoGenerazione {
  scadenzeEsaminate: number;
  avvisiCreati: number;
  avvisiGiaPresenti: number;
  senzaDestinatario: number;
}

/**
 * Gestione degli avvisi di scadenza al cliente.
 *
 * L'archivio Access tracciava primo e secondo avviso; la prima migrazione
 * aveva perso quell'informazione, lasciando lo studio senza la prova di aver
 * avvisato il cliente. Questo servizio ricostruisce quella funzione.
 *
 * AMBITO: qui gli avvisi vengono solo maturati e registrati. L'invio vero e
 * proprio (email al cliente, gestione degli errori di consegna, solleciti)
 * fa parte della fase successiva; `esito` resta DA_INVIARE finché un mittente
 * non lo aggiorna con `marcaInviato` o `marcaErrore`.
 */
@Injectable()
export class AvvisiService {
  private readonly logger = new Logger(AvvisiService.name);

  constructor(
    private prisma: PrismaService,
    private scadenzeService: ScadenzeService,
  ) {}

  /**
   * Matura gli avvisi dovuti per le scadenze non ancora pagate.
   *
   * È idempotente: il vincolo di unicità (scadenza, tipo) impedisce di creare
   * due volte lo stesso avviso, quindi la generazione può essere rieseguita
   * senza produrre doppioni né doppi invii.
   */
  async generaAvvisiDovuti(): Promise<EsitoGenerazione> {
    const esito: EsitoGenerazione = {
      scadenzeEsaminate: 0,
      avvisiCreati: 0,
      avvisiGiaPresenti: 0,
      senzaDestinatario: 0,
    };

    // La finestra più ampia è quella del primo avviso: basta una sola query.
    const scadenze = await this.scadenzeService.getScadenzeInScadenza(
      ANTICIPO_AVVISI.PRIMO,
    );
    esito.scadenzeEsaminate = scadenze.length;

    for (const scadenza of scadenze) {
      const destinatario = scadenza.veicolo?.cliente?.email ?? null;
      if (!destinatario) {
        // Senza recapito l'avviso non è inviabile: viene comunque contato,
        // perché è un dato mancante da sanare, non un caso da ignorare.
        esito.senzaDestinatario++;
        continue;
      }

      const tipiDovuti: Array<'PRIMO' | 'SECONDO'> = [];
      if (scadenza.giorniRimanenti <= ANTICIPO_AVVISI.PRIMO) tipiDovuti.push('PRIMO');
      if (scadenza.giorniRimanenti <= ANTICIPO_AVVISI.SECONDO) tipiDovuti.push('SECONDO');

      for (const tipo of tipiDovuti) {
        const risultato = await this.prisma.avviso.createMany({
          data: [
            {
              idScadenza: scadenza.id,
              tipo,
              canale: 'EMAIL',
              destinatario,
              esito: 'DA_INVIARE',
            },
          ],
          // Il vincolo di unicità rende l'operazione ripetibile senza errori.
          skipDuplicates: true,
        });

        if (risultato.count > 0) {
          esito.avvisiCreati++;
        } else {
          esito.avvisiGiaPresenti++;
        }
      }
    }

    if (esito.avvisiCreati > 0) {
      this.logger.log(
        `Maturati ${esito.avvisiCreati} avvisi (${esito.senzaDestinatario} scadenze senza recapito cliente)`,
      );
    }

    return esito;
  }

  /** Avvisi non ancora inviati, dal più urgente. */
  async inSospeso(limite = 500) {
    return this.prisma.avviso.findMany({
      where: { esito: 'DA_INVIARE' },
      include: {
        scadenza: {
          include: {
            veicolo: { include: { cliente: true } },
          },
        },
      },
      orderBy: [{ scadenza: { dataScadenza: 'asc' } }],
      take: limite,
    });
  }

  /** Avvisi registrati su una scadenza, storici compresi. */
  async perScadenza(idScadenza: number) {
    return this.prisma.avviso.findMany({
      where: { idScadenza },
      orderBy: [{ tipo: 'asc' }],
    });
  }

  async marcaInviato(id: number, dataInvio: Date = new Date()) {
    await this.assicuratiCheEsista(id);

    return this.prisma.avviso.update({
      where: { id },
      data: {
        esito: 'INVIATO',
        // Colonna DATE: si registra il giorno, normalizzato in UTC.
        dataInvio: new Date(
          Date.UTC(
            dataInvio.getUTCFullYear(),
            dataInvio.getUTCMonth(),
            dataInvio.getUTCDate(),
          ),
        ),
        errore: null,
      },
    });
  }

  async marcaErrore(id: number, messaggio: string) {
    await this.assicuratiCheEsista(id);

    return this.prisma.avviso.update({
      where: { id },
      data: {
        esito: 'ERRORE',
        errore: messaggio.slice(0, 1000),
      },
    });
  }

  private async assicuratiCheEsista(id: number) {
    const avviso = await this.prisma.avviso.findUnique({ where: { id } });
    if (!avviso) {
      throw new NotFoundException(`Avviso con ID ${id} non trovato`);
    }
    return avviso;
  }
}
