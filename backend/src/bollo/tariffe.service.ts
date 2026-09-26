import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { TariffaBollo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TariffeService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /**
   * Ottieni tutte le configurazioni
   */
  async getConfigurazioni() {
    return this.prisma.configurazioneBollo.findMany({
      orderBy: [{ annoValidita: 'desc' }, { regione: 'asc' }],
      include: {
        _count: {
          select: { tariffe: true },
        },
      },
    });
  }

  /**
   * Ottieni una configurazione con tutte le sue tariffe
   */
  async getConfigurazione(id: number) {
    const config = await this.prisma.configurazioneBollo.findUnique({
      where: { id },
      include: {
        tariffe: {
          orderBy: [{ tipoVeicolo: 'asc' }, { ordine: 'asc' }, { sogliaMin: 'asc' }],
        },
      },
    });

    if (!config) {
      throw new NotFoundException(`Configurazione con ID ${id} non trovata`);
    }

    return config;
  }

  /**
   * Crea una nuova configurazione
   */
  async createConfigurazione(data: {
    annoValidita: number;
    regione: string;
    scontoRid?: number;
    note?: string;
  }, utente?: string) {
    // Verifica che non esista già
    const existing = await this.prisma.configurazioneBollo.findUnique({
      where: {
        annoValidita_regione: {
          annoValidita: data.annoValidita,
          regione: data.regione,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Configurazione per anno ${data.annoValidita} e regione ${data.regione} già esistente`,
      );
    }

    const config = await this.prisma.configurazioneBollo.create({
      data: {
        annoValidita: data.annoValidita,
        ...this.intervalloValiditaAnno(data.annoValidita),
        regione: data.regione,
        scontoRid: data.scontoRid || 0,
        note: data.note,
        attivo: true,
      },
    });
    await this.audit.registra({
      entita: 'configurazione',
      idEntita: config.id,
      azione: 'CREAZIONE',
      utente,
      datiDopo: { annoValidita: config.annoValidita, regione: config.regione, scontoRid: config.scontoRid.toString() },
    });
    return config;
  }

  /**
   * Intervallo di validità predefinito per una configurazione: l'anno solare.
   *
   * È la semantica che `annoValidita` ha sempre avuto implicitamente; averla
   * come date esplicite permetterà di rappresentare variazioni infra-anno
   * senza cambiare le configurazioni esistenti.
   */
  private intervalloValiditaAnno(anno: number): { validoDa: Date; validoA: Date } {
    return {
      validoDa: new Date(Date.UTC(anno, 0, 1)),
      validoA: new Date(Date.UTC(anno, 11, 31)),
    };
  }


  /**
   * Duplica una configurazione esistente per un nuovo anno
   */
  async duplicaConfigurazione(id: number, nuovoAnno: number, utente?: string) {
    const configOriginale = await this.prisma.configurazioneBollo.findUnique({
      where: { id },
      include: { tariffe: true },
    });

    if (!configOriginale) {
      throw new NotFoundException(`Configurazione con ID ${id} non trovata`);
    }

    // Verifica che non esista già per il nuovo anno
    const existing = await this.prisma.configurazioneBollo.findUnique({
      where: {
        annoValidita_regione: {
          annoValidita: nuovoAnno,
          regione: configOriginale.regione,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Configurazione per anno ${nuovoAnno} e regione ${configOriginale.regione} già esistente`,
      );
    }

    // Crea configurazione e tariffe in un'unica transazione:
    // atomica (nessuna configurazione mezza duplicata) e molto più veloce
    // del create riga per riga
    const nuovaConfig = await this.prisma.$transaction(async (tx) => {
      const config = await tx.configurazioneBollo.create({
        data: {
          annoValidita: nuovoAnno,
          ...this.intervalloValiditaAnno(nuovoAnno),
          regione: configOriginale.regione,
          scontoRid: configOriginale.scontoRid,
          note: `Duplicata da configurazione ${configOriginale.annoValidita}`,
          attivo: true,
        },
      });

      await tx.tariffaBollo.createMany({
        data: configOriginale.tariffe.map((tariffa) => ({
          idConfigurazione: config.id,
          tipoVeicolo: tariffa.tipoVeicolo,
          categoriaEuro: tariffa.categoriaEuro,
          unitaMisura: tariffa.unitaMisura,
          sogliaMin: tariffa.sogliaMin,
          sogliaMax: tariffa.sogliaMax,
          importoUnitario: tariffa.importoUnitario,
          importoFisso: tariffa.importoFisso,
          tipoSospensione: tariffa.tipoSospensione,
          periodicita: tariffa.periodicita,
          descrizione: tariffa.descrizione,
          ordine: tariffa.ordine,
        })),
      });

      // Duplica anche le esenzioni: prima venivano perse nella duplicazione
      const esenzioni = await tx.esenzioneBollo.findMany({
        where: { idConfigurazione: id },
      });
      if (esenzioni.length > 0) {
        await tx.esenzioneBollo.createMany({
          data: esenzioni.map((e) => ({
            idConfigurazione: config.id,
            tipoEsenzione: e.tipoEsenzione,
            percentualeRiduzione: e.percentualeRiduzione,
            tipoVeicolo: e.tipoVeicolo,
            alimentazione: e.alimentazione,
            anniDaImmatricolazione: e.anniDaImmatricolazione,
            descrizione: e.descrizione,
            note: e.note,
          })),
        });
      }

      return config;
    });

    await this.audit.registra({
      entita: 'configurazione',
      idEntita: nuovaConfig.id,
      azione: 'CREAZIONE',
      utente,
      datiDopo: { annoValidita: nuovoAnno, regione: configOriginale.regione, tariffe: configOriginale.tariffe.length },
      note: `Duplicata dalla configurazione ${configOriginale.annoValidita} (id ${id})`,
    });

    return this.getConfigurazione(nuovaConfig.id);
  }

  /**
   * Aggiorna lo stato di una configurazione
   */
  async updateConfigurazione(
    id: number,
    data: {
      scontoRid?: number;
      attivo?: boolean;
      note?: string;
    },
  ) {
    return this.prisma.configurazioneBollo.update({
      where: { id },
      data,
    });
  }

  /**
   * Ottieni le tariffe di una configurazione
   */
  async getTariffe(idConfigurazione: number) {
    return this.prisma.tariffaBollo.findMany({
      where: { idConfigurazione },
      orderBy: [{ tipoVeicolo: 'asc' }, { ordine: 'asc' }, { sogliaMin: 'asc' }],
    });
  }

  /**
   * Ottieni le tariffe raggruppate per tipo veicolo
   */
  async getTariffeRaggruppate(idConfigurazione: number) {
    const tariffe = await this.getTariffe(idConfigurazione);

    // Raggruppa per tipo veicolo
    const raggruppate: Record<string, any[]> = {};
    for (const tariffa of tariffe) {
      if (!raggruppate[tariffa.tipoVeicolo]) {
        raggruppate[tariffa.tipoVeicolo] = [];
      }
      raggruppate[tariffa.tipoVeicolo].push(tariffa);
    }

    return raggruppate;
  }

  /**
   * Aggiorna una tariffa. Le tariffe determinano gli importi di tutti i
   * bolli: ogni modifica resta nel registro, con i valori prima e dopo.
   */
  async updateTariffa(
    id: number,
    data: {
      importoUnitario?: number;
      importoFisso?: number | null;
      descrizione?: string;
      sogliaMin?: number;
      sogliaMax?: number;
    },
    utente?: string,
  ) {
    const prima = await this.prisma.tariffaBollo.findUnique({ where: { id } });
    if (!prima) throw new NotFoundException(`Tariffa ${id} non trovata`);
    const dopo = await this.prisma.tariffaBollo.update({ where: { id }, data });
    await this.audit.registra({
      entita: 'tariffa',
      idEntita: id,
      azione: 'MODIFICA',
      utente,
      datiPrima: this.campiAudit(prima),
      datiDopo: this.campiAudit(dopo),
    });
    return dopo;
  }

  /** I campi di una tariffa che contano per il registro (i Decimal come testo esatto). */
  private campiAudit(t: TariffaBollo) {
    return {
      idConfigurazione: t.idConfigurazione,
      tipoVeicolo: t.tipoVeicolo,
      categoriaEuro: t.categoriaEuro,
      importoUnitario: t.importoUnitario.toString(),
      importoFisso: t.importoFisso?.toString() ?? null,
      sogliaMin: t.sogliaMin?.toString() ?? null,
      sogliaMax: t.sogliaMax?.toString() ?? null,
      descrizione: t.descrizione,
    };
  }

  /**
   * Crea una nuova tariffa
   */
  async createTariffa(
    idConfigurazione: number,
    data: {
      tipoVeicolo: string;
      categoriaEuro?: string;
      unitaMisura: string;
      sogliaMin?: number;
      sogliaMax?: number;
      importoUnitario: number;
      importoFisso?: number;
      tipoSospensione?: string;
      periodicita?: string;
      descrizione?: string;
      ordine?: number;
    },
    utente?: string,
  ) {
    const tariffa = await this.prisma.tariffaBollo.create({
      data: {
        idConfigurazione,
        tipoVeicolo: data.tipoVeicolo,
        categoriaEuro: data.categoriaEuro,
        unitaMisura: data.unitaMisura,
        sogliaMin: data.sogliaMin,
        sogliaMax: data.sogliaMax,
        importoUnitario: data.importoUnitario,
        importoFisso: data.importoFisso,
        tipoSospensione: data.tipoSospensione,
        periodicita: data.periodicita || 'ANNUALE',
        descrizione: data.descrizione,
        ordine: data.ordine || 0,
      },
    });
    await this.audit.registra({
      entita: 'tariffa',
      idEntita: tariffa.id,
      azione: 'CREAZIONE',
      utente,
      datiDopo: this.campiAudit(tariffa),
    });
    return tariffa;
  }

  /**
   * Elimina una tariffa
   */
  async deleteTariffa(id: number) {
    return this.prisma.tariffaBollo.delete({
      where: { id },
    });
  }

  /**
   * Aggiorna massivamente gli importi di tutte le tariffe di una configurazione
   * (utile per adeguamenti ISTAT)
   */
  async adeguaImporti(idConfigurazione: number, percentualeAdeguamento: number) {
    const tariffe = await this.getTariffe(idConfigurazione);

    // Tutti gli update in un'unica transazione: atomico (nessun adeguamento
    // parziale in caso di errore) e un solo round-trip verso il database
    await this.prisma.$transaction(
      tariffe.map((tariffa) => {
        const nuovoImportoUnitario =
          tariffa.importoUnitario.toNumber() * (1 + percentualeAdeguamento / 100);
        const nuovoImportoFisso = tariffa.importoFisso
          ? tariffa.importoFisso.toNumber() * (1 + percentualeAdeguamento / 100)
          : null;

        return this.prisma.tariffaBollo.update({
          where: { id: tariffa.id },
          data: {
            importoUnitario: Math.round(nuovoImportoUnitario * 10000) / 10000,
            importoFisso: nuovoImportoFisso
              ? Math.round(nuovoImportoFisso * 100) / 100
              : undefined,
          },
        });
      }),
    );

    const aggiornate = tariffe.length;
    return { message: `Adeguate ${aggiornate} tariffe del ${percentualeAdeguamento}%`, aggiornate };
  }
}
