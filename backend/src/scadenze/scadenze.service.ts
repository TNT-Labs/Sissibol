import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScadenzaDto } from './dto/create-scadenza.dto';
import { UpdateScadenzaDto } from './dto/update-scadenza.dto';
import { BolloService } from '../bollo/bollo.service';
import { StatoScadenza, Periodicita } from '../prisma/types';

/**
 * MESI DI SCADENZA QUADRIMESTRALE secondo normativa:
 * - Gennaio (mese 1): scadenza ultimo giorno mese
 * - Maggio (mese 5): scadenza 31 maggio
 * - Settembre (mese 9): scadenza 30 settembre
 */
const MESI_QUADRIMESTRE = [1, 5, 9];

/**
 * Date specifiche di scadenza per periodicità quadrimestrale
 * secondo normativa regionale Lombardia 2026
 */
const DATE_SCADENZA_QUADRIMESTRALE: Record<number, { giorno: number }> = {
  1: { giorno: 31 },  // Gennaio: 31 gennaio
  5: { giorno: 31 },  // Maggio: 31 maggio
  9: { giorno: 30 },  // Settembre: 30 settembre
};

@Injectable()
export class ScadenzeService {
  constructor(
    private prisma: PrismaService,
    private bolloService: BolloService,
  ) {}

  // Utility: ottiene l'ultimo giorno del mese
  private getUltimoGiornoMese(anno: number, mese: number): Date {
    // mese è 1-12, Date usa 0-11, quindi mese senza -1 dà il primo giorno del mese successivo
    // sottraendo 1 giorno otteniamo l'ultimo giorno del mese desiderato
    return new Date(anno, mese, 0);
  }

  // Utility: ottiene il primo giorno del mese
  private getPrimoGiornoMese(anno: number, mese: number): Date {
    return new Date(anno, mese - 1, 1);
  }

  /**
   * Calcola la data effettiva di scadenza considerando la periodicità
   *
   * Per periodicità ANNUALE: ultimo giorno del mese di scadenza
   * Per periodicità QUADRIMESTRALE: date specifiche secondo normativa
   *   - Gennaio: 31 gennaio
   *   - Maggio: 31 maggio
   *   - Settembre: 30 settembre
   *
   * @param anno - Anno di scadenza
   * @param mese - Mese di scadenza (1-12)
   * @param periodicita - 'ANNUALE' o 'QUADRIMESTRALE'
   * @returns Data effettiva di scadenza
   */
  getDataScadenzaEffettiva(
    anno: number,
    mese: number,
    periodicita: 'ANNUALE' | 'QUADRIMESTRALE' = 'ANNUALE',
  ): Date {
    if (periodicita === 'QUADRIMESTRALE') {
      // Verifica che il mese sia valido per la periodicità quadrimestrale
      if (!MESI_QUADRIMESTRE.includes(mese)) {
        // Trova il prossimo mese quadrimestrale valido
        const prossimoMese = MESI_QUADRIMESTRE.find((m) => m >= mese) || MESI_QUADRIMESTRE[0];
        const annoEffettivo = prossimoMese < mese ? anno + 1 : anno;
        mese = prossimoMese;
        anno = annoEffettivo;
      }

      // Usa la data specifica per il quadrimestre
      const configData = DATE_SCADENZA_QUADRIMESTRALE[mese];
      if (configData) {
        // Verifica che il giorno sia valido per il mese (es. febbraio bisestile)
        const ultimoGiornoMese = new Date(anno, mese, 0).getDate();
        const giornoEffettivo = Math.min(configData.giorno, ultimoGiornoMese);
        return new Date(anno, mese - 1, giornoEffettivo, 23, 59, 59);
      }
    }

    // Default: ultimo giorno del mese per periodicità ANNUALE
    const ultimoGiorno = this.getUltimoGiornoMese(anno, mese);
    ultimoGiorno.setHours(23, 59, 59);
    return ultimoGiorno;
  }

  /**
   * Verifica se una scadenza è in scadenza considerando la periodicità
   *
   * @param scadenza - Oggetto scadenza
   * @param giorniAnticipo - Giorni di anticipo per la notifica
   * @returns true se la scadenza è imminente
   */
  isScadenzaImminente(
    scadenza: { annoScadenza: number; meseScadenza: number; periodicita: string },
    giorniAnticipo: number = 30,
  ): boolean {
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);

    const dataScadenza = this.getDataScadenzaEffettiva(
      scadenza.annoScadenza,
      scadenza.meseScadenza,
      scadenza.periodicita as 'ANNUALE' | 'QUADRIMESTRALE',
    );

    const dataLimite = new Date(oggi);
    dataLimite.setDate(dataLimite.getDate() + giorniAnticipo);

    // La scadenza è imminente se:
    // - Non è ancora passata (dataScadenza >= oggi)
    // - È entro il limite di anticipo (dataScadenza <= dataLimite)
    return dataScadenza >= oggi && dataScadenza <= dataLimite;
  }

  /**
   * Calcola i giorni rimanenti alla scadenza
   *
   * @param scadenza - Oggetto scadenza
   * @returns Numero di giorni rimanenti (negativo se scaduta)
   */
  getGiorniAllaScadenza(
    scadenza: { annoScadenza: number; meseScadenza: number; periodicita: string },
  ): number {
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);

    const dataScadenza = this.getDataScadenzaEffettiva(
      scadenza.annoScadenza,
      scadenza.meseScadenza,
      scadenza.periodicita as 'ANNUALE' | 'QUADRIMESTRALE',
    );
    dataScadenza.setHours(0, 0, 0, 0);

    const diffTime = dataScadenza.getTime() - oggi.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Valida il mese di scadenza per la periodicità selezionata
   *
   * @param mese - Mese di scadenza (1-12)
   * @param periodicita - 'ANNUALE' o 'QUADRIMESTRALE'
   * @returns Oggetto con validazione e suggerimenti
   */
  validaMeseScadenza(
    mese: number,
    periodicita: 'ANNUALE' | 'QUADRIMESTRALE',
  ): { valido: boolean; messaggio?: string; mesiValidi?: number[] } {
    if (periodicita === 'QUADRIMESTRALE') {
      if (!MESI_QUADRIMESTRE.includes(mese)) {
        return {
          valido: false,
          messaggio: `Per la periodicità quadrimestrale, i mesi validi sono: Gennaio (1), Maggio (5), Settembre (9)`,
          mesiValidi: MESI_QUADRIMESTRE,
        };
      }
    }

    if (mese < 1 || mese > 12) {
      return {
        valido: false,
        messaggio: 'Il mese deve essere compreso tra 1 e 12',
      };
    }

    return { valido: true };
  }

  async create(createScadenzaDto: CreateScadenzaDto) {
    const periodicita = (createScadenzaDto.periodicita as 'ANNUALE' | 'QUADRIMESTRALE') || 'ANNUALE';

    // Valida il mese di scadenza per la periodicità selezionata
    const validazione = this.validaMeseScadenza(createScadenzaDto.meseScadenza, periodicita);
    if (!validazione.valido) {
      throw new Error(validazione.messaggio);
    }

    let importoPrevisto = createScadenzaDto.importoPrevisto;

    // Se l'importo non è specificato, calcolalo automaticamente
    if (importoPrevisto === undefined || importoPrevisto === null) {
      try {
        const calcolo = await this.bolloService.calcolaBollo(
          createScadenzaDto.idVeicolo,
          createScadenzaDto.annoScadenza,
          periodicita,
        );
        importoPrevisto = calcolo.importoBase;
      } catch (error) {
        // Se il calcolo fallisce, lascia l'importo nullo
        console.warn(`Impossibile calcolare il bollo per veicolo ${createScadenzaDto.idVeicolo}:`, error.message);
      }
    }

    return this.prisma.scadenza.create({
      data: {
        idVeicolo: createScadenzaDto.idVeicolo,
        meseScadenza: createScadenzaDto.meseScadenza,
        annoScadenza: createScadenzaDto.annoScadenza,
        periodicita: periodicita,
        importoPrevisto: importoPrevisto,
        stato: createScadenzaDto.stato,
      },
      include: {
        veicolo: {
          include: {
            cliente: true,
          },
        },
      },
    });
  }

  /**
   * Ricalcola l'importo di una scadenza esistente
   */
  async ricalcolaImporto(id: number) {
    const scadenza = await this.findOne(id);

    try {
      const calcolo = await this.bolloService.calcolaBollo(
        scadenza.idVeicolo,
        scadenza.annoScadenza,
        scadenza.periodicita as 'ANNUALE' | 'QUADRIMESTRALE',
      );

      return this.prisma.scadenza.update({
        where: { id },
        data: { importoPrevisto: calcolo.importoBase },
        include: {
          veicolo: { include: { cliente: true } },
        },
      });
    } catch (error) {
      throw new Error(`Impossibile ricalcolare il bollo: ${error.message}`);
    }
  }

  async findAll(stato?: StatoScadenza, idCliente?: number) {
    // Prima aggiorniamo tutte le scadenze scadute
    await this.updateScaduteAutomaticamente();

    const where: any = {};

    if (stato) {
      where.stato = stato;
    }

    if (idCliente) {
      where.veicolo = {
        idCliente: idCliente,
      };
    }

    return this.prisma.scadenza.findMany({
      where,
      include: {
        veicolo: {
          include: {
            cliente: true,
          },
        },
        pagamenti: true,
      },
      orderBy: [
        { annoScadenza: 'desc' },
        { meseScadenza: 'desc' },
      ],
    });
  }

  async findOne(id: number) {
    const scadenza = await this.prisma.scadenza.findUnique({
      where: { id },
      include: {
        veicolo: {
          include: {
            cliente: true,
          },
        },
        pagamenti: true,
      },
    });

    if (!scadenza) {
      throw new NotFoundException(`Scadenza con ID ${id} non trovata`);
    }

    return scadenza;
  }

  async update(id: number, updateScadenzaDto: UpdateScadenzaDto) {
    await this.findOne(id); // Check if exists

    return this.prisma.scadenza.update({
      where: { id },
      data: updateScadenzaDto,
      include: {
        veicolo: {
          include: {
            cliente: true,
          },
        },
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id); // Check if exists

    return this.prisma.scadenza.delete({
      where: { id },
    });
  }

  /**
   * Aggiorna automaticamente le scadenze scadute
   * Una scadenza è scaduta se siamo oltre la data effettiva di scadenza,
   * calcolata in base alla periodicità (ANNUALE o QUADRIMESTRALE)
   */
  async updateScaduteAutomaticamente() {
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);

    // Trova tutte le scadenze DA_PAGARE e verifica se sono scadute
    const scadenzeDaPagare = await this.prisma.scadenza.findMany({
      where: {
        stato: StatoScadenza.DA_PAGARE,
      },
    });

    const idsScadute: number[] = [];
    for (const scadenza of scadenzeDaPagare) {
      // Usa la data effettiva di scadenza considerando la periodicità
      const dataScadenzaEffettiva = this.getDataScadenzaEffettiva(
        scadenza.annoScadenza,
        scadenza.meseScadenza,
        scadenza.periodicita as 'ANNUALE' | 'QUADRIMESTRALE',
      );

      // Se oggi è dopo la data effettiva di scadenza, la scadenza è scaduta
      if (oggi > dataScadenzaEffettiva) {
        idsScadute.push(scadenza.id);
      }
    }

    if (idsScadute.length > 0) {
      await this.prisma.scadenza.updateMany({
        where: {
          id: { in: idsScadute },
        },
        data: {
          stato: StatoScadenza.SCADUTO,
        },
      });
    }

    return idsScadute.length;
  }

  /**
   * Ottieni scadenze in scadenza (per notifiche)
   * Una scadenza è "in scadenza" se la sua data effettiva cade entro i prossimi N giorni.
   * La data effettiva è calcolata considerando la periodicità (ANNUALE/QUADRIMESTRALE).
   *
   * @param giorniAnticipo - Numero di giorni di anticipo per le notifiche (default: 30)
   * @returns Lista di scadenze imminenti con dettagli veicolo e cliente
   */
  async getScadenzeInScadenza(giorniAnticipo: number = 30) {
    // Prima aggiorna le scadenze già scadute
    await this.updateScaduteAutomaticamente();

    // Trova tutte le scadenze DA_PAGARE
    const scadenzeDaPagare = await this.prisma.scadenza.findMany({
      where: {
        stato: StatoScadenza.DA_PAGARE,
      },
      include: {
        veicolo: {
          include: {
            cliente: true,
          },
        },
      },
    });

    // Filtra quelle che scadono entro il periodo usando il nuovo metodo
    const scadenzeInScadenza = scadenzeDaPagare.filter((scadenza) =>
      this.isScadenzaImminente(
        {
          annoScadenza: scadenza.annoScadenza,
          meseScadenza: scadenza.meseScadenza,
          periodicita: scadenza.periodicita,
        },
        giorniAnticipo,
      ),
    );

    // Arricchisci con informazioni aggiuntive e ordina per urgenza
    const scadenzeArricchite = scadenzeInScadenza.map((scadenza) => {
      const giorniRimanenti = this.getGiorniAllaScadenza({
        annoScadenza: scadenza.annoScadenza,
        meseScadenza: scadenza.meseScadenza,
        periodicita: scadenza.periodicita,
      });

      const dataScadenzaEffettiva = this.getDataScadenzaEffettiva(
        scadenza.annoScadenza,
        scadenza.meseScadenza,
        scadenza.periodicita as 'ANNUALE' | 'QUADRIMESTRALE',
      );

      return {
        ...scadenza,
        giorniRimanenti,
        dataScadenzaEffettiva,
        urgenza: giorniRimanenti <= 7 ? 'CRITICA' : giorniRimanenti <= 14 ? 'ALTA' : 'NORMALE',
      };
    });

    // Ordina per urgenza (giorni rimanenti crescenti)
    return scadenzeArricchite.sort((a, b) => a.giorniRimanenti - b.giorniRimanenti);
  }
}
