import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScadenzeService } from '../scadenze/scadenze.service';
import { AuditService } from '../audit/audit.service';
import { estraiRecapiti, MOTIVO_ASSORBITO } from './regole-invio';
import { nomeCliente } from './composizione';

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
  /** Cliente senza un indirizzo email utilizzabile */
  senzaDestinatario: number;
  /** Cliente che ha chiesto di non ricevere avvisi */
  esclusiPerScelta: number;
  /** Secondi avvisi nati già assorbiti dal primo, maturato insieme */
  assorbiti: number;
}

export type EsitoAvviso = 'DA_INVIARE' | 'IN_INVIO' | 'INVIATO' | 'ERRORE' | 'ANNULLATO';

export interface ClienteSenzaRecapito {
  idCliente: number;
  nome: string;
  email: string | null;
  scadenze: number;
  primaScadenza: Date;
}

/**
 * Gestione degli avvisi di scadenza al cliente.
 *
 * L'archivio Access tracciava primo e secondo avviso; la prima migrazione
 * aveva perso quell'informazione, lasciando lo studio senza la prova di aver
 * avvisato il cliente. Questo servizio ricostruisce quella funzione.
 *
 * Qui gli avvisi vengono maturati, consultati e gestiti a mano (rimessi in
 * coda, annullati). L'invio è di AvvisiInvioService.
 */
@Injectable()
export class AvvisiService {
  private readonly logger = new Logger(AvvisiService.name);

  constructor(
    private prisma: PrismaService,
    private scadenzeService: ScadenzeService,
    private audit: AuditService,
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
      esclusiPerScelta: 0,
      assorbiti: 0,
    };

    // La finestra più ampia è quella del primo avviso: basta una sola query.
    const scadenze = await this.scadenzeService.getScadenzeInScadenza(
      ANTICIPO_AVVISI.PRIMO,
    );
    esito.scadenzeEsaminate = scadenze.length;

    for (const scadenza of scadenze) {
      const cliente = scadenza.veicolo?.cliente;
      if (cliente && cliente.avvisiEmail === false) {
        esito.esclusiPerScelta++;
        continue;
      }
      const recapiti = estraiRecapiti(cliente?.email);
      const destinatario = recapiti.length > 0 ? recapiti.join(', ') : null;
      if (!destinatario) {
        // Senza un recapito utilizzabile l'avviso non è inviabile: viene
        // contato, perché è un dato mancante da sanare, non un caso da ignorare.
        esito.senzaDestinatario++;
        continue;
      }

      const tipiDovuti: Array<'PRIMO' | 'SECONDO'> = [];
      if (scadenza.giorniRimanenti <= ANTICIPO_AVVISI.PRIMO) tipiDovuti.push('PRIMO');
      if (scadenza.giorniRimanenti <= ANTICIPO_AVVISI.SECONDO) tipiDovuti.push('SECONDO');

      // Se primo e secondo maturano insieme, il cliente riceve un solo
      // avviso: il secondo nasce già assorbito dal primo (vedi valutaAvviso).
      const primoGiaPresente = (scadenza.avvisi ?? []).some((a) => a.tipo === 'PRIMO');
      const assorbeSecondo = tipiDovuti.length === 2 && !primoGiaPresente;

      for (const tipo of tipiDovuti) {
        const assorbito = tipo === 'SECONDO' && assorbeSecondo;
        const risultato = await this.prisma.avviso.createMany({
          data: [
            {
              idScadenza: scadenza.id,
              tipo,
              canale: 'EMAIL',
              destinatario,
              esito: assorbito ? 'ANNULLATO' : 'DA_INVIARE',
              note: assorbito ? MOTIVO_ASSORBITO : null,
            },
          ],
          // Il vincolo di unicità rende l'operazione ripetibile senza errori.
          skipDuplicates: true,
        });

        if (risultato.count === 0) {
          esito.avvisiGiaPresenti++;
        } else if (assorbito) {
          esito.assorbiti++;
        } else {
          esito.avvisiCreati++;
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

  /** Avvisi inviabili per esito, con scadenza, veicolo e cliente. */
  async elenco(esito: EsitoAvviso, limite = 200) {
    return this.prisma.avviso.findMany({
      where: { esito, ...(esito === 'INVIATO' ? {} : { canale: 'EMAIL' }) },
      include: {
        scadenza: {
          select: {
            id: true,
            dataScadenza: true,
            importoPrevisto: true,
            stato: true,
            veicolo: {
              select: {
                id: true,
                targa: true,
                cliente: {
                  select: { id: true, ragioneSociale: true, nome: true, cognome: true, email: true },
                },
              },
            },
          },
        },
      },
      // Gli inviati dal più recente; gli altri dalla scadenza più vicina.
      orderBy:
        esito === 'INVIATO'
          ? [{ dataInvio: 'desc' }, { id: 'desc' }]
          : [{ scadenza: { dataScadenza: 'asc' } }, { id: 'asc' }],
      take: Math.min(Math.max(limite, 1), 1000),
    });
  }

  /** Conteggi per esito degli avvisi via email, e invii degli ultimi 30 giorni. */
  async conteggi() {
    const perEsito = await this.prisma.avviso.groupBy({
      by: ['esito'],
      where: { canale: 'EMAIL' },
      _count: { _all: true },
    });
    const trentaGiorniFa = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const inviatiUltimi30Giorni = await this.prisma.avviso.count({
      where: { canale: 'EMAIL', esito: 'INVIATO', inviatoIl: { gte: trentaGiorniFa } },
    });
    const conteggio = (e: EsitoAvviso) =>
      perEsito.find((r) => r.esito === e)?._count._all ?? 0;
    return {
      daInviare: conteggio('DA_INVIARE'),
      inInvio: conteggio('IN_INVIO'),
      errori: conteggio('ERRORE'),
      annullati: conteggio('ANNULLATO'),
      inviati: conteggio('INVIATO'),
      inviatiUltimi30Giorni,
    };
  }

  /**
   * Clienti con scadenze nella finestra degli avvisi ma senza un indirizzo
   * email utilizzabile: il lavoro da fare perché gli avvisi possano partire.
   * Esclusi i clienti che hanno scelto di non ricevere avvisi.
   */
  async senzaRecapito(): Promise<ClienteSenzaRecapito[]> {
    const scadenze = await this.scadenzeService.getScadenzeInScadenza(ANTICIPO_AVVISI.PRIMO);
    const perCliente = new Map<number, ClienteSenzaRecapito>();

    for (const scadenza of scadenze) {
      const cliente = scadenza.veicolo?.cliente;
      if (!cliente || cliente.avvisiEmail === false) continue;
      if (estraiRecapiti(cliente.email).length > 0) continue;

      const voce = perCliente.get(cliente.id) ?? {
        idCliente: cliente.id,
        nome: nomeCliente(cliente),
        email: cliente.email ?? null,
        scadenze: 0,
        primaScadenza: scadenza.dataScadenza,
      };
      voce.scadenze++;
      if (scadenza.dataScadenza < voce.primaScadenza) voce.primaScadenza = scadenza.dataScadenza;
      perCliente.set(cliente.id, voce);
    }

    return [...perCliente.values()].sort(
      (a, b) => a.primaScadenza.getTime() - b.primaScadenza.getTime() || a.nome.localeCompare(b.nome),
    );
  }

  /**
   * Rimette in coda avvisi in errore o annullati, azzerando i tentativi.
   * È la risposta a un errore risolto (recapito corretto, server riparato) o
   * a un annullamento da revocare. Gli avvisi da archivio non si inviano.
   */
  async rimettiInCoda(ids: number[], utente?: string): Promise<{ rimessi: number }> {
    const avvisi = await this.prisma.avviso.findMany({
      where: { id: { in: ids }, canale: 'EMAIL', esito: { in: ['ERRORE', 'ANNULLATO'] } },
      select: { id: true, esito: true, errore: true, note: true },
    });

    let rimessi = 0;
    for (const avviso of avvisi) {
      const { count } = await this.prisma.avviso.updateMany({
        where: { id: avviso.id, esito: avviso.esito },
        // La nota dell'annullamento non vale più: resta nel registro.
        data: { esito: 'DA_INVIARE', tentativi: 0, prossimoTentativo: null, errore: null, note: null },
      });
      if (count === 0) continue;
      rimessi++;
      await this.audit.registra({
        entita: 'avviso',
        idEntita: avviso.id,
        azione: 'MODIFICA',
        utente,
        datiPrima: { esito: avviso.esito, errore: avviso.errore, note: avviso.note },
        datiDopo: { esito: 'DA_INVIARE' },
        note: 'Avviso rimesso in coda',
      });
    }
    return { rimessi };
  }

  /** Annulla un avviso non ancora inviato. */
  async annulla(id: number, utente?: string) {
    const avviso = await this.assicuratiCheEsista(id);
    if (avviso.esito !== 'DA_INVIARE' && avviso.esito !== 'ERRORE') {
      throw new BadRequestException(
        'Si possono annullare solo avvisi in coda o in errore',
      );
    }

    const note = `Annullato manualmente${utente ? ` da ${utente}` : ''}`;
    const { count } = await this.prisma.avviso.updateMany({
      where: { id, esito: avviso.esito },
      data: { esito: 'ANNULLATO', note, prossimoTentativo: null },
    });
    if (count === 0) {
      throw new BadRequestException('L\'avviso è stato preso in carico da un invio in corso');
    }
    await this.audit.registra({
      entita: 'avviso',
      idEntita: id,
      azione: 'MODIFICA',
      utente,
      datiPrima: { esito: avviso.esito },
      datiDopo: { esito: 'ANNULLATO' },
      note,
    });
    return this.prisma.avviso.findUnique({ where: { id } });
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
