import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TariffeService {
  constructor(private prisma: PrismaService) {}

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
  }) {
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

    return this.prisma.configurazioneBollo.create({
      data: {
        annoValidita: data.annoValidita,
        regione: data.regione,
        scontoRid: data.scontoRid || 0,
        note: data.note,
        attivo: true,
      },
    });
  }

  /**
   * Duplica una configurazione esistente per un nuovo anno
   */
  async duplicaConfigurazione(id: number, nuovoAnno: number) {
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

    // Crea la nuova configurazione
    const nuovaConfig = await this.prisma.configurazioneBollo.create({
      data: {
        annoValidita: nuovoAnno,
        regione: configOriginale.regione,
        scontoRid: configOriginale.scontoRid,
        note: `Duplicata da configurazione ${configOriginale.annoValidita}`,
        attivo: true,
      },
    });

    // Duplica tutte le tariffe
    for (const tariffa of configOriginale.tariffe) {
      await this.prisma.tariffaBollo.create({
        data: {
          idConfigurazione: nuovaConfig.id,
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
        },
      });
    }

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
   * Aggiorna una tariffa
   */
  async updateTariffa(
    id: number,
    data: {
      importoUnitario?: number;
      importoFisso?: number;
      descrizione?: string;
      sogliaMin?: number;
      sogliaMax?: number;
    },
  ) {
    return this.prisma.tariffaBollo.update({
      where: { id },
      data,
    });
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
  ) {
    return this.prisma.tariffaBollo.create({
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

    let aggiornate = 0;
    for (const tariffa of tariffe) {
      const nuovoImportoUnitario =
        tariffa.importoUnitario.toNumber() * (1 + percentualeAdeguamento / 100);
      const nuovoImportoFisso = tariffa.importoFisso
        ? tariffa.importoFisso.toNumber() * (1 + percentualeAdeguamento / 100)
        : null;

      await this.prisma.tariffaBollo.update({
        where: { id: tariffa.id },
        data: {
          importoUnitario: Math.round(nuovoImportoUnitario * 10000) / 10000,
          importoFisso: nuovoImportoFisso
            ? Math.round(nuovoImportoFisso * 100) / 100
            : undefined,
        },
      });

      aggiornate++;
    }

    return { message: `Adeguate ${aggiornate} tariffe del ${percentualeAdeguamento}%`, aggiornate };
  }
}
