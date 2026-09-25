import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Mittente } from '../mail/mailer.service';
import { componiAvviso, EmailComposta, nomeCliente } from './composizione';
import { ConfigurazioneAvvisi, leggiConfigurazioneAvvisi } from './configurazione';
import {
  classificaErroreInvio,
  eSecondoPerIlCliente,
  MAX_TENTATIVI,
  MESSAGGIO_ESITO_INCERTO,
  MINUTI_INVIO_ABBANDONATO,
  oggiNormalizzato,
  prossimoTentativo,
  valutaAvviso,
} from './regole-invio';

/** Token d'iniezione del mittente: nei test si sostituisce il server SMTP. */
export const MITTENTE = Symbol('MITTENTE');
/** Token d'iniezione della configurazione, per i test. */
export const CONFIGURAZIONE_AVVISI = Symbol('CONFIGURAZIONE_AVVISI');

export interface EsitoInvio {
  emailInviate: number;
  avvisiInviati: number;
  annullati: number;
  errori: number;
  /** Errori temporanei: l'avviso resta in coda con un nuovo tentativo */
  daRitentare: number;
  /** Avvisi rimasti IN_INVIO da un invio interrotto, marcati come incerti */
  recuperatiIncerti: number;
  /** Clienti rimasti da avvisare oltre il limite di email per esecuzione */
  clientiRimandati: number;
  /** Motivo dell'interruzione per un problema del server di posta */
  interrotto: string | null;
  giaInCorso: boolean;
  smtpNonConfigurato: boolean;
}

function esitoVuoto(): EsitoInvio {
  return {
    emailInviate: 0,
    avvisiInviati: 0,
    annullati: 0,
    errori: 0,
    daRitentare: 0,
    recuperatiIncerti: 0,
    clientiRimandati: 0,
    interrotto: null,
    giaInCorso: false,
    smtpNonConfigurato: false,
  };
}

const INCLUDE_CANDIDATO = {
  scadenza: {
    include: {
      avvisi: { select: { id: true, tipo: true, esito: true } },
      veicolo: { include: { cliente: true } },
    },
  },
} as const;

type Candidato = Awaited<ReturnType<AvvisiInvioService['caricaCandidati']>>[number];

interface Gruppo {
  idCliente: number;
  nomeCliente: string;
  recapiti: string[];
  avvisi: Candidato[];
}

/**
 * Invio degli avvisi maturati.
 *
 * Garanzie, nell'ordine in cui contano per lo studio:
 *
 * 1. Mai due volte lo stesso avviso. Ogni avviso viene preso in carico con
 *    un aggiornamento condizionato (DA_INVIARE -> IN_INVIO) prima di
 *    spedirlo: due invii concorrenti, anche su istanze diverse, non possono
 *    prendere lo stesso avviso.
 * 2. Mai un invio incerto ripetuto alla cieca. Se il processo si ferma dopo
 *    aver spedito ma prima di registrarlo, l'avviso resta IN_INVIO e al giro
 *    successivo diventa ERRORE con esito incerto: meglio chiedere a una
 *    persona che scrivere due volte al cliente.
 * 3. La prova dell'invio: data, ora, Message-ID, destinatari, oggetto e
 *    testo restano sull'avviso.
 * 4. Un server di posta guasto non consuma i tentativi: l'invio si ferma e
 *    gli avvisi tornano in coda intatti.
 */
@Injectable()
export class AvvisiInvioService {
  private readonly logger = new Logger(AvvisiInvioService.name);
  private inCorso = false;
  private ultima: { quando: Date; esito: EsitoInvio } | null = null;

  constructor(
    private prisma: PrismaService,
    @Inject(MITTENTE) private mittente: Mittente,
    @Inject(CONFIGURAZIONE_AVVISI) private configurazione: ConfigurazioneAvvisi = leggiConfigurazioneAvvisi(),
  ) {}

  get smtpConfigurato(): boolean {
    return this.mittente.configurato;
  }

  get ultimaEsecuzione() {
    return this.ultima;
  }

  /** Invia gli avvisi in coda, un'email per cliente. */
  async inviaDovuti(opzioni: { limiteEmail?: number } = {}): Promise<EsitoInvio> {
    if (!this.mittente.configurato) {
      return { ...esitoVuoto(), smtpNonConfigurato: true };
    }
    // Evita che il giro pianificato e un invio manuale si sovrappongano nello
    // stesso processo. Fra processi diversi protegge la presa in carico.
    if (this.inCorso) {
      return { ...esitoVuoto(), giaInCorso: true };
    }

    this.inCorso = true;
    try {
      const esito = await this.esegui(
        opzioni.limiteEmail ?? this.configurazione.maxEmailPerEsecuzione,
      );
      this.ultima = { quando: new Date(), esito };
      return esito;
    } finally {
      this.inCorso = false;
    }
  }

  /**
   * Anteprima dell'email di cui farebbe parte l'avviso, o il contenuto
   * effettivamente inviato se l'avviso è già partito.
   */
  async anteprima(idAvviso: number): Promise<{
    inviato: boolean;
    destinatari: string[];
    avvisi: number[];
    email: EmailComposta | null;
    motivo: string | null;
  }> {
    const avviso = await this.prisma.avviso.findUnique({
      where: { id: idAvviso },
      include: INCLUDE_CANDIDATO,
    });
    if (!avviso) {
      throw new NotFoundException(`Avviso con ID ${idAvviso} non trovato`);
    }

    if (avviso.esito === 'INVIATO') {
      return {
        inviato: true,
        destinatari: avviso.destinatario ? avviso.destinatario.split(/,\s*/) : [],
        avvisi: [avviso.id],
        email: avviso.oggetto ? { oggetto: avviso.oggetto, testo: avviso.testo ?? '', html: '' } : null,
        motivo: avviso.oggetto ? null : 'Avviso inviato senza copia del contenuto (archivio storico)',
      };
    }
    if (avviso.canale !== 'EMAIL' || avviso.esito !== 'DA_INVIARE') {
      return {
        inviato: false,
        destinatari: [],
        avvisi: [avviso.id],
        email: null,
        motivo: 'L\'avviso non è in coda d\'invio',
      };
    }

    const oggi = oggiNormalizzato();
    const decisione = valutaAvviso(avviso, oggi);
    if (decisione.azione !== 'INVIA') {
      return { inviato: false, destinatari: [], avvisi: [avviso.id], email: null, motivo: decisione.motivo };
    }

    // L'email reale comprende tutti gli avvisi in coda dello stesso cliente.
    const candidati = await this.caricaCandidati({
      idCliente: avviso.scadenza.veicolo.idCliente,
      ancheInAttesa: true,
    });
    const gruppo = candidati.filter((c) => valutaAvviso(c, oggi).azione === 'INVIA');
    return {
      inviato: false,
      destinatari: decisione.recapiti,
      avvisi: gruppo.map((c) => c.id),
      email: this.componi(gruppo),
      motivo: null,
    };
  }

  private async esegui(limiteEmail: number): Promise<EsitoInvio> {
    const esito = esitoVuoto();
    const adesso = new Date();
    const oggi = oggiNormalizzato(adesso);

    esito.recuperatiIncerti = await this.recuperaInviiInterrotti(adesso);

    const candidati = await this.caricaCandidati({ adesso });
    const gruppi = new Map<number, Gruppo>();

    for (const avviso of candidati) {
      const decisione = valutaAvviso(avviso, oggi);
      if (decisione.azione !== 'INVIA') {
        await this.applicaChiusura(avviso.id, decisione, esito);
        continue;
      }

      const cliente = avviso.scadenza.veicolo.cliente;
      const gruppo = gruppi.get(cliente.id) ?? {
        idCliente: cliente.id,
        nomeCliente: nomeCliente(cliente),
        recapiti: decisione.recapiti,
        avvisi: [],
      };
      gruppo.avvisi.push(avviso);
      gruppi.set(cliente.id, gruppo);
    }

    // I candidati sono ordinati per scadenza: i clienti con la scadenza più
    // vicina vengono avvisati per primi se si raggiunge il limite.
    const daInviare = [...gruppi.values()];
    esito.clientiRimandati = Math.max(0, daInviare.length - limiteEmail);

    for (const gruppo of daInviare.slice(0, limiteEmail)) {
      const interrotto = await this.inviaGruppo(gruppo, esito);
      if (interrotto) {
        esito.interrotto = interrotto;
        break;
      }
    }

    if (
      esito.emailInviate + esito.annullati + esito.errori + esito.daRitentare + esito.recuperatiIncerti > 0 ||
      esito.interrotto
    ) {
      this.logger.log(
        `Avvisi: ${esito.emailInviate} email (${esito.avvisiInviati} avvisi), ` +
          `${esito.annullati} annullati, ${esito.errori} in errore, ${esito.daRitentare} da ritentare, ` +
          `${esito.recuperatiIncerti} incerti, ${esito.clientiRimandati} clienti rimandati` +
          (esito.interrotto ? `; interrotto: ${esito.interrotto}` : ''),
      );
    }
    return esito;
  }

  /**
   * Spedisce l'email di un cliente. Restituisce il motivo se l'invio va
   * interrotto per un problema del server di posta.
   */
  private async inviaGruppo(gruppo: Gruppo, esito: EsitoInvio): Promise<string | null> {
    // Presa in carico avviso per avviso: solo quelli passati da DA_INVIARE a
    // IN_INVIO in questa esecuzione sono nostri.
    const presi: Candidato[] = [];
    for (const avviso of gruppo.avvisi) {
      const { count } = await this.prisma.avviso.updateMany({
        where: { id: avviso.id, esito: 'DA_INVIARE' },
        // updatedAt esplicito: è l'orologio con cui si riconosce un invio
        // interrotto, e deve partire dalla presa in carico.
        data: { esito: 'IN_INVIO', updatedAt: new Date() },
      });
      if (count === 1) presi.push(avviso);
    }
    if (presi.length === 0) return null;

    const ids = presi.map((a) => a.id);
    const email = this.componi(presi);

    let idMessaggio: string | null;
    try {
      ({ idMessaggio } = await this.mittente.spedisci({
        a: gruppo.recapiti,
        oggetto: email.oggetto,
        testo: email.testo,
        html: email.html,
        rispondiA: this.configurazione.rispondiA,
      }));
    } catch (errore) {
      return this.registraFallimento(presi, errore, esito);
    }

    const inviatoIl = new Date();
    await this.prisma.avviso.updateMany({
      where: { id: { in: ids }, esito: 'IN_INVIO' },
      data: {
        esito: 'INVIATO',
        dataInvio: oggiNormalizzato(inviatoIl),
        inviatoIl,
        idMessaggio,
        destinatario: gruppo.recapiti.join(', '),
        oggetto: email.oggetto,
        testo: email.testo,
        errore: null,
        prossimoTentativo: null,
      },
    });
    esito.emailInviate++;
    esito.avvisiInviati += presi.length;
    return null;
  }

  private async registraFallimento(
    presi: Candidato[],
    errore: unknown,
    esito: EsitoInvio,
  ): Promise<string | null> {
    const { categoria, messaggio } = classificaErroreInvio(errore);
    const ids = presi.map((a) => a.id);

    if (categoria === 'SISTEMICO') {
      // Il problema non è di questi avvisi: tornano in coda senza consumare
      // tentativi, e l'invio si ferma.
      await this.prisma.avviso.updateMany({
        where: { id: { in: ids }, esito: 'IN_INVIO' },
        data: { esito: 'DA_INVIARE' },
      });
      this.logger.error(`Invio avvisi interrotto: ${messaggio}`);
      return messaggio;
    }

    const adesso = new Date();
    for (const avviso of presi) {
      const tentativi = avviso.tentativi + 1;
      const ritenta = categoria === 'TEMPORANEO' && tentativi < MAX_TENTATIVI;
      await this.prisma.avviso.updateMany({
        where: { id: avviso.id, esito: 'IN_INVIO' },
        data: {
          esito: ritenta ? 'DA_INVIARE' : 'ERRORE',
          tentativi,
          prossimoTentativo: ritenta ? prossimoTentativo(tentativi, adesso) : null,
          errore: messaggio,
        },
      });
      if (ritenta) esito.daRitentare++;
      else esito.errori++;
    }
    this.logger.warn(`Avviso non inviato (${categoria}): ${messaggio}`);
    return null;
  }

  private componi(avvisi: Candidato[]): EmailComposta {
    return componiAvviso({
      nomeCliente: nomeCliente(avvisi[0].scadenza.veicolo.cliente),
      firma: this.configurazione.firma,
      voci: avvisi.map((a) => ({
        targa: a.scadenza.veicolo.targa,
        dataScadenza: a.scadenza.dataScadenza,
        importoPrevisto: a.scadenza.importoPrevisto,
        tipo: eSecondoPerIlCliente(a.tipo, a.scadenza.avvisi) ? 'SECONDO' : 'PRIMO',
      })),
    });
  }

  /**
   * Chiude gli avvisi in coda che non vanno più inviati (scadenza pagata o
   * superata, cliente disattivato...), senza spedire nulla.
   *
   * L'invio lo fa comunque prima di spedire; questa riconciliazione serve a
   * tenere pulita la coda quando l'invio non gira (server di posta non
   * configurato, invio manuale): altrimenti gli avvisi non più dovuti
   * resterebbero "da inviare" per sempre.
   */
  async riconciliaCoda(): Promise<{ annullati: number; errori: number }> {
    const esito = esitoVuoto();
    const oggi = oggiNormalizzato();
    const candidati = await this.caricaCandidati({ ancheInAttesa: true });
    for (const avviso of candidati) {
      const decisione = valutaAvviso(avviso, oggi);
      if (decisione.azione !== 'INVIA') {
        await this.applicaChiusura(avviso.id, decisione, esito);
      }
    }
    return { annullati: esito.annullati, errori: esito.errori };
  }

  private async applicaChiusura(
    id: number,
    decisione: { azione: 'ANNULLA' | 'ERRORE'; motivo: string },
    esito: EsitoInvio,
  ) {
    if (decisione.azione === 'ANNULLA') {
      if (await this.chiudi(id, { esito: 'ANNULLATO', note: decisione.motivo })) esito.annullati++;
    } else if (await this.chiudi(id, { esito: 'ERRORE', errore: decisione.motivo })) {
      esito.errori++;
    }
  }

  /** Chiude un avviso in coda; false se un altro invio l'ha già preso. */
  private async chiudi(
    id: number,
    data: { esito: 'ANNULLATO' | 'ERRORE'; note?: string; errore?: string },
  ): Promise<boolean> {
    const { count } = await this.prisma.avviso.updateMany({
      where: { id, esito: 'DA_INVIARE' },
      data: { ...data, prossimoTentativo: null },
    });
    return count === 1;
  }

  private async recuperaInviiInterrotti(adesso: Date): Promise<number> {
    const soglia = new Date(adesso.getTime() - MINUTI_INVIO_ABBANDONATO * 60_000);
    const { count } = await this.prisma.avviso.updateMany({
      where: { esito: 'IN_INVIO', updatedAt: { lt: soglia } },
      data: { esito: 'ERRORE', errore: MESSAGGIO_ESITO_INCERTO },
    });
    if (count > 0) {
      this.logger.warn(`${count} avvisi da un invio interrotto marcati come incerti`);
    }
    return count;
  }

  private caricaCandidati(filtro: { adesso?: Date; idCliente?: number; ancheInAttesa?: boolean }) {
    const adesso = filtro.adesso ?? new Date();
    return this.prisma.avviso.findMany({
      where: {
        canale: 'EMAIL',
        esito: 'DA_INVIARE',
        ...(filtro.ancheInAttesa
          ? {}
          : { OR: [{ prossimoTentativo: null }, { prossimoTentativo: { lte: adesso } }] }),
        ...(filtro.idCliente !== undefined
          ? { scadenza: { veicolo: { idCliente: filtro.idCliente } } }
          : {}),
      },
      include: INCLUDE_CANDIDATO,
      orderBy: [{ scadenza: { dataScadenza: 'asc' } }, { id: 'asc' }],
      // La coda è limitata dalla finestra di maturazione (30 giorni): il
      // tetto protegge solo da situazioni anomale.
      take: 5000,
    });
  }
}
