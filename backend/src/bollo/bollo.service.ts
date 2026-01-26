import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

// Mapping classi Euro tecniche -> categorie tariffarie
const CATEGORIA_TARIFFARIA_AUTOVETTURE: Record<string, string> = {
  'Euro 0': 'Euro 0',
  'Euro 1': 'Euro 1',
  'Euro 2': 'Euro 2',
  'Euro 3': 'Euro 3',
  'Euro 4': 'Euro 4-5-6',
  'Euro 5': 'Euro 4-5-6',
  'Euro 5a': 'Euro 4-5-6',
  'Euro 5b': 'Euro 4-5-6',
  'Euro 6': 'Euro 4-5-6',
  'Euro 6a': 'Euro 4-5-6',
  'Euro 6b': 'Euro 4-5-6',
  'Euro 6c': 'Euro 4-5-6',
  'Euro 6d-TEMP': 'Euro 4-5-6',
  'Euro 6d': 'Euro 4-5-6',
  'Euro 6d-ISC': 'Euro 4-5-6',
  'Euro 6d-ISC-FCM': 'Euro 4-5-6',
  'Euro 6e': 'Euro 4-5-6',
  'Euro 7': 'Euro 4-5-6',
};

const CATEGORIA_TARIFFARIA_MOTOCICLI: Record<string, string> = {
  'Euro 0': 'Euro 0',
  'Euro 1': 'Euro 1',
  'Euro 2': 'Euro 2',
  'Euro 3': 'Euro 3 e successivi',
  'Euro 4': 'Euro 3 e successivi',
  'Euro 5': 'Euro 3 e successivi',
};

export interface CalcolobolloResult {
  importoBase: number;
  importoRidotto: number | null; // Con sconto RID
  scontoRid: number;
  tariffeApplicate: TariffaApplicata[];
  esenzioni: EsenzioneApplicata[];
  note: string[];
  dettaglioCalcolo: string;
}

interface TariffaApplicata {
  descrizione: string;
  importo: number;
  unitaMisura: string;
  valore: number | null;
}

interface EsenzioneApplicata {
  tipo: string;
  descrizione: string;
  percentualeRiduzione: number | null;
}

@Injectable()
export class BolloService {
  constructor(private prisma: PrismaService) {}

  /**
   * Calcola l'importo del bollo per un veicolo
   */
  async calcolaBollo(
    idVeicolo: number,
    anno: number = new Date().getFullYear(),
    periodicita: 'ANNUALE' | 'QUADRIMESTRALE' = 'ANNUALE',
  ): Promise<CalcolobolloResult> {
    // Recupera il veicolo con tutti i dati
    const veicolo = await this.prisma.veicolo.findUnique({
      where: { id: idVeicolo },
      include: { cliente: true },
    });

    if (!veicolo) {
      throw new NotFoundException(`Veicolo con ID ${idVeicolo} non trovato`);
    }

    // Recupera la configurazione tariffe per anno e regione
    const regione = veicolo.regione || 'Lombardia';
    let configurazione = await this.prisma.configurazioneBollo.findFirst({
      where: {
        annoValidita: anno,
        regione: regione,
        attivo: true,
      },
      include: { tariffe: true },
    });

    // Fallback a configurazione DEFAULT se non trovata
    if (!configurazione) {
      configurazione = await this.prisma.configurazioneBollo.findFirst({
        where: {
          annoValidita: anno,
          regione: 'DEFAULT',
          attivo: true,
        },
        include: { tariffe: true },
      });
    }

    if (!configurazione) {
      throw new NotFoundException(
        `Nessuna configurazione tariffe trovata per anno ${anno} e regione ${regione}`,
      );
    }

    const result: CalcolobolloResult = {
      importoBase: 0,
      importoRidotto: null,
      scontoRid: configurazione.scontoRid.toNumber(),
      tariffeApplicate: [],
      esenzioni: [],
      note: [],
      dettaglioCalcolo: '',
    };

    // Verifica esenzioni
    const esenzioni = await this.verificaEsenzioni(veicolo, configurazione.id);
    result.esenzioni = esenzioni;

    // Se c'è esenzione totale, restituisci 0
    const esenzioneTotale = esenzioni.find((e) => e.tipo === 'TOTALE');
    if (esenzioneTotale) {
      result.note.push(`Veicolo esente: ${esenzioneTotale.descrizione}`);
      result.dettaglioCalcolo = 'Veicolo esente dal pagamento del bollo';
      return result;
    }

    // Calcola in base al tipo veicolo
    const tipoVeicolo = veicolo.tipoVeicolo || 'Autovettura';
    const importoCalcolato = await this.calcolaImportoPerTipo(
      veicolo,
      tipoVeicolo,
      configurazione.tariffe,
      periodicita,
      result,
    );

    result.importoBase = importoCalcolato;

    // Applica riduzioni parziali
    let importoFinale = importoCalcolato;
    for (const esenzione of esenzioni) {
      if (esenzione.tipo === 'PARZIALE' && esenzione.percentualeRiduzione) {
        const riduzione = (importoCalcolato * esenzione.percentualeRiduzione) / 100;
        importoFinale -= riduzione;
        result.note.push(
          `Riduzione ${esenzione.percentualeRiduzione}%: -€${riduzione.toFixed(2)} (${esenzione.descrizione})`,
        );
      }
    }

    result.importoBase = Math.round(importoFinale * 100) / 100;

    // Calcola importo con sconto RID (domiciliazione bancaria)
    if (configurazione.scontoRid.toNumber() > 0) {
      const sconto = (result.importoBase * configurazione.scontoRid.toNumber()) / 100;
      result.importoRidotto = Math.round((result.importoBase - sconto) * 100) / 100;
    }

    return result;
  }

  /**
   * Verifica le esenzioni applicabili al veicolo
   */
  private async verificaEsenzioni(
    veicolo: any,
    idConfigurazione: number,
  ): Promise<EsenzioneApplicata[]> {
    const esenzioniApplicate: EsenzioneApplicata[] = [];

    // Recupera tutte le esenzioni per questa configurazione
    const esenzioni = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM "esenzioni_bollo" WHERE "id_configurazione" = ${idConfigurazione}
    `;

    for (const esenzione of esenzioni) {
      let applicabile = false;

      // Verifica per alimentazione
      if (esenzione.alimentazione && veicolo.alimentazione === esenzione.alimentazione) {
        applicabile = true;
      }

      // Verifica per anzianità veicolo
      if (esenzione.anni_da_immatricolazione && veicolo.dataImmatricolazione) {
        const anniVeicolo = this.calcolaAnniVeicolo(veicolo.dataImmatricolazione);
        if (anniVeicolo >= esenzione.anni_da_immatricolazione) {
          applicabile = true;
        }
      }

      // Verifica per tipo veicolo
      if (esenzione.tipo_veicolo && veicolo.tipoVeicolo === esenzione.tipo_veicolo) {
        applicabile = true;
      }

      if (applicabile) {
        esenzioniApplicate.push({
          tipo: esenzione.tipo_esenzione,
          descrizione: esenzione.descrizione,
          percentualeRiduzione: esenzione.percentuale_riduzione
            ? parseFloat(esenzione.percentuale_riduzione)
            : null,
        });
      }
    }

    return esenzioniApplicate;
  }

  /**
   * Calcola gli anni del veicolo dalla data di immatricolazione
   */
  private calcolaAnniVeicolo(dataImmatricolazione: Date): number {
    const oggi = new Date();
    const data = new Date(dataImmatricolazione);
    let anni = oggi.getFullYear() - data.getFullYear();
    const mesiDiff = oggi.getMonth() - data.getMonth();
    if (mesiDiff < 0 || (mesiDiff === 0 && oggi.getDate() < data.getDate())) {
      anni--;
    }
    return anni;
  }

  /**
   * Calcola l'importo in base al tipo veicolo
   */
  private async calcolaImportoPerTipo(
    veicolo: any,
    tipoVeicolo: string,
    tariffe: any[],
    periodicita: string,
    result: CalcolobolloResult,
  ): Promise<number> {
    let importo = 0;
    const dettagli: string[] = [];

    // Filtra le tariffe per tipo veicolo e periodicità
    const tariffeFiltrate = tariffe.filter(
      (t) =>
        t.tipoVeicolo === tipoVeicolo &&
        (t.periodicita === periodicita || t.periodicita === 'ANNUALE'),
    );

    switch (tipoVeicolo) {
      case 'Autovettura':
      case 'Autoveicolo uso promiscuo':
        importo = this.calcolaAutovettura(veicolo, tariffeFiltrate, result, dettagli);
        break;

      case 'Motociclo':
        importo = this.calcolaMotociclo(veicolo, tariffeFiltrate, result, dettagli);
        break;

      case 'Autocarro':
      case 'Autotreno':
      case 'Autoarticolato':
        importo = this.calcolaAutocarro(veicolo, tariffeFiltrate, periodicita, result, dettagli);
        break;

      case 'Trattore stradale':
        importo = this.calcolaTratoreStradale(
          veicolo,
          tariffeFiltrate,
          periodicita,
          result,
          dettagli,
        );
        break;

      case 'Autobus':
      case 'Autoveicolo speciale':
      case 'Autocaravan':
        importo = this.calcolaVeicoloPerKw(veicolo, tariffeFiltrate, result, dettagli);
        break;

      case 'Motocarro':
      case 'Motofurgone':
        importo = this.calcolaMotocarroMotofurgone(veicolo, tariffeFiltrate, result, dettagli);
        break;

      case 'Rimorchio':
      case 'Rimorchio speciale':
      case 'Semirimorchio':
        importo = this.calcolaRimorchio(veicolo, tariffeFiltrate, result, dettagli);
        break;

      case 'Rimorchio trasporto persone':
        importo = this.calcolaRimorchioPersone(veicolo, tariffeFiltrate, result, dettagli);
        break;

      default:
        // Fallback: prova calcolo per KW
        importo = this.calcolaVeicoloPerKw(veicolo, tariffeFiltrate, result, dettagli);
        result.note.push(`Tipo veicolo "${tipoVeicolo}" non riconosciuto, applicata tariffa generica per KW`);
    }

    result.dettaglioCalcolo = dettagli.join('\n');
    return importo;
  }

  /**
   * Calcola bollo autovettura (per KW con fasce Euro)
   */
  private calcolaAutovettura(
    veicolo: any,
    tariffe: any[],
    result: CalcolobolloResult,
    dettagli: string[],
  ): number {
    const potenzaKw = veicolo.potenzaKw ? new Decimal(veicolo.potenzaKw).toNumber() : 0;
    const classeEuro = veicolo.classeAmbientale || 'Euro 4';
    const categoriaTariffaria = CATEGORIA_TARIFFARIA_AUTOVETTURE[classeEuro] || 'Euro 4-5-6';

    if (potenzaKw === 0) {
      result.note.push('Potenza KW non specificata, impossibile calcolare il bollo');
      return 0;
    }

    // Trova le tariffe per questa categoria Euro
    const tariffeFiltrate = tariffe.filter(
      (t) =>
        t.categoriaEuro === categoriaTariffaria && t.unitaMisura === 'KW',
    );

    let importoTotale = 0;
    let kwRimanenti = potenzaKw;

    // Ordina per soglia minima
    tariffeFiltrate.sort((a, b) => (a.sogliaMin || 0) - (b.sogliaMin || 0));

    for (const tariffa of tariffeFiltrate) {
      const sogliaMin = tariffa.sogliaMin ? tariffa.sogliaMin.toNumber() : 0;
      const sogliaMax = tariffa.sogliaMax ? tariffa.sogliaMax.toNumber() : Infinity;
      const importoUnitario = tariffa.importoUnitario.toNumber();

      if (potenzaKw <= sogliaMin) continue;

      const kwInFascia = Math.min(potenzaKw, sogliaMax) - sogliaMin;
      if (kwInFascia > 0) {
        const importoFascia = kwInFascia * importoUnitario;
        importoTotale += importoFascia;

        result.tariffeApplicate.push({
          descrizione: tariffa.descrizione || `${categoriaTariffaria} - ${sogliaMax === Infinity ? 'oltre' : 'fino a'} ${sogliaMax === Infinity ? sogliaMin : sogliaMax} KW`,
          importo: Math.round(importoFascia * 100) / 100,
          unitaMisura: 'KW',
          valore: kwInFascia,
        });

        dettagli.push(
          `${kwInFascia} KW x €${importoUnitario.toFixed(4)}/KW = €${importoFascia.toFixed(2)}`,
        );
      }
    }

    dettagli.unshift(`Autovettura ${classeEuro} (${categoriaTariffaria}) - ${potenzaKw} KW`);
    return Math.round(importoTotale * 100) / 100;
  }

  /**
   * Calcola bollo motociclo (per KW con fasce Euro)
   */
  private calcolaMotociclo(
    veicolo: any,
    tariffe: any[],
    result: CalcolobolloResult,
    dettagli: string[],
  ): number {
    const potenzaKw = veicolo.potenzaKw ? new Decimal(veicolo.potenzaKw).toNumber() : 0;
    const classeEuro = veicolo.classeAmbientale || 'Euro 3';
    const categoriaTariffaria = CATEGORIA_TARIFFARIA_MOTOCICLI[classeEuro] || 'Euro 3 e successivi';

    if (potenzaKw === 0) {
      result.note.push('Potenza KW non specificata, impossibile calcolare il bollo');
      return 0;
    }

    // Trova la tariffa corretta
    const tariffeFiltrate = tariffe.filter(
      (t) =>
        t.categoriaEuro === categoriaTariffaria && t.unitaMisura === 'KW',
    );

    let importoTotale = 0;

    for (const tariffa of tariffeFiltrate) {
      const sogliaMin = tariffa.sogliaMin ? tariffa.sogliaMin.toNumber() : 0;
      const sogliaMax = tariffa.sogliaMax ? tariffa.sogliaMax.toNumber() : Infinity;
      const importoFisso = tariffa.importoFisso ? tariffa.importoFisso.toNumber() : 0;
      const importoUnitario = tariffa.importoUnitario.toNumber();

      // Motocicli: fino a 11 KW = importo fisso, oltre = importo per KW eccedenti
      if (potenzaKw <= sogliaMax && potenzaKw > sogliaMin) {
        if (importoFisso > 0) {
          // Fascia fissa (fino a 11 KW)
          importoTotale = importoFisso;
          result.tariffeApplicate.push({
            descrizione: tariffa.descrizione || `Motociclo fino a ${sogliaMax} KW`,
            importo: importoFisso,
            unitaMisura: 'FISSO',
            valore: null,
          });
          dettagli.push(`Importo fisso fino a ${sogliaMax} KW: €${importoFisso.toFixed(2)}`);
        } else if (importoUnitario > 0) {
          // Oltre 11 KW: importo base + importo per KW eccedenti
          const kwEccedenti = potenzaKw - sogliaMin;
          importoTotale = kwEccedenti * importoUnitario;
          // Aggiungi importo fisso della fascia precedente
          const tariffaBase = tariffeFiltrate.find(
            (t) => t.sogliaMax && t.sogliaMax.toNumber() === sogliaMin,
          );
          if (tariffaBase && tariffaBase.importoFisso) {
            importoTotale += tariffaBase.importoFisso.toNumber();
          }

          result.tariffeApplicate.push({
            descrizione: tariffa.descrizione || `Motociclo oltre ${sogliaMin} KW`,
            importo: Math.round(importoTotale * 100) / 100,
            unitaMisura: 'KW',
            valore: kwEccedenti,
          });
          dettagli.push(
            `${kwEccedenti} KW eccedenti x €${importoUnitario.toFixed(4)}/KW = €${(kwEccedenti * importoUnitario).toFixed(2)}`,
          );
        }
        break;
      }
    }

    dettagli.unshift(`Motociclo ${classeEuro} (${categoriaTariffaria}) - ${potenzaKw} KW`);
    return Math.round(importoTotale * 100) / 100;
  }

  /**
   * Calcola bollo autocarro
   */
  private calcolaAutocarro(
    veicolo: any,
    tariffe: any[],
    periodicita: string,
    result: CalcolobolloResult,
    dettagli: string[],
  ): number {
    const pesoComplessivo = veicolo.pesoComplessivoKg || 0;
    const portata = veicolo.portataKg || 0;
    const numeroAssi = veicolo.numeroAssi || 2;
    const tipoSospensione = veicolo.tipoSospensione || 'Pneumatiche';

    // Autocarri >= 12 tonnellate: tariffa per assi e sospensioni
    if (pesoComplessivo >= 12000) {
      const tariffeFiltrate = tariffe.filter(
        (t) =>
          t.unitaMisura === 'ASSI' &&
          t.tipoSospensione === tipoSospensione &&
          t.periodicita === periodicita,
      );

      // Trova la tariffa per il numero di assi
      const tariffa = tariffeFiltrate.find((t) => {
        const min = t.sogliaMin ? t.sogliaMin.toNumber() : 0;
        const max = t.sogliaMax ? t.sogliaMax.toNumber() : Infinity;
        return numeroAssi >= min && (max === null || numeroAssi <= max);
      });

      if (tariffa && tariffa.importoFisso) {
        const importo = tariffa.importoFisso.toNumber();
        result.tariffeApplicate.push({
          descrizione:
            tariffa.descrizione ||
            `Autocarro >= 12 ton, ${numeroAssi} assi, sospensioni ${tipoSospensione.toLowerCase()}`,
          importo: importo,
          unitaMisura: 'FISSO',
          valore: null,
        });
        dettagli.push(
          `Autocarro pesante (${pesoComplessivo} kg) - ${numeroAssi} assi, sospensioni ${tipoSospensione.toLowerCase()}`,
        );
        dettagli.push(`Importo ${periodicita.toLowerCase()}: €${importo.toFixed(2)}`);
        return importo;
      }
    }

    // Autocarri < 12 tonnellate: tariffa per portata
    const tariffeFiltrate = tariffe.filter((t) => t.unitaMisura === 'KG_PORTATA');

    const tariffa = tariffeFiltrate.find((t) => {
      const min = t.sogliaMin ? t.sogliaMin.toNumber() : 0;
      const max = t.sogliaMax ? t.sogliaMax.toNumber() : Infinity;
      return portata >= min && portata < max;
    });

    if (tariffa && tariffa.importoFisso) {
      const importo = tariffa.importoFisso.toNumber();
      result.tariffeApplicate.push({
        descrizione: tariffa.descrizione || `Autocarro portata ${portata} kg`,
        importo: importo,
        unitaMisura: 'FISSO',
        valore: null,
      });
      dettagli.push(`Autocarro leggero - portata ${portata} kg`);
      dettagli.push(`Importo annuale: €${importo.toFixed(2)}`);
      return importo;
    }

    result.note.push('Impossibile determinare la tariffa per questo autocarro');
    return 0;
  }

  /**
   * Calcola bollo trattore stradale (autocarro + tassa aggiuntiva massa rimorchiabile)
   */
  private calcolaTratoreStradale(
    veicolo: any,
    tariffe: any[],
    periodicita: string,
    result: CalcolobolloResult,
    dettagli: string[],
  ): number {
    // Prima calcola come autocarro
    let importoBase = this.calcolaAutocarro(veicolo, tariffe, periodicita, result, dettagli);

    // Poi aggiungi tassa aggiuntiva per massa rimorchiabile
    const massaRimorchiabile = veicolo.massaRimorchiabileKg || 0;
    if (massaRimorchiabile > 0) {
      const tariffeMassa = tariffe.filter((t) => t.unitaMisura === 'MASSA_RIMORCHIABILE');

      // Trova la tariffa appropriata
      const tariffa = tariffeMassa.find((t) => t.periodicita === periodicita);

      if (tariffa && tariffa.importoFisso) {
        const importoAggiuntivo = tariffa.importoFisso.toNumber();
        result.tariffeApplicate.push({
          descrizione:
            tariffa.descrizione || `Tassa aggiuntiva massa rimorchiabile ${massaRimorchiabile} kg`,
          importo: importoAggiuntivo,
          unitaMisura: 'FISSO',
          valore: null,
        });
        dettagli.push(`Tassa aggiuntiva massa rimorchiabile: €${importoAggiuntivo.toFixed(2)}`);
        importoBase += importoAggiuntivo;
      }
    }

    return importoBase;
  }

  /**
   * Calcola bollo per veicoli con tariffa semplice per KW
   */
  private calcolaVeicoloPerKw(
    veicolo: any,
    tariffe: any[],
    result: CalcolobolloResult,
    dettagli: string[],
  ): number {
    const potenzaKw = veicolo.potenzaKw ? new Decimal(veicolo.potenzaKw).toNumber() : 0;

    if (potenzaKw === 0) {
      result.note.push('Potenza KW non specificata, impossibile calcolare il bollo');
      return 0;
    }

    const tariffa = tariffe.find((t) => t.unitaMisura === 'KW');
    if (!tariffa) {
      result.note.push('Tariffa non trovata per questo tipo di veicolo');
      return 0;
    }

    const importoUnitario = tariffa.importoUnitario.toNumber();
    const importo = potenzaKw * importoUnitario;

    result.tariffeApplicate.push({
      descrizione: tariffa.descrizione || `${veicolo.tipoVeicolo} - tariffa per KW`,
      importo: Math.round(importo * 100) / 100,
      unitaMisura: 'KW',
      valore: potenzaKw,
    });

    dettagli.push(`${veicolo.tipoVeicolo} - ${potenzaKw} KW`);
    dettagli.push(`${potenzaKw} KW x €${importoUnitario.toFixed(4)}/KW = €${importo.toFixed(2)}`);

    return Math.round(importo * 100) / 100;
  }

  /**
   * Calcola bollo motocarro/motofurgone (per cilindrata)
   */
  private calcolaMotocarroMotofurgone(
    veicolo: any,
    tariffe: any[],
    result: CalcolobolloResult,
    dettagli: string[],
  ): number {
    const cilindrata = veicolo.cilindrata || 0;

    if (cilindrata === 0) {
      result.note.push('Cilindrata non specificata, impossibile calcolare il bollo');
      return 0;
    }

    const tariffa = tariffe.find((t) => {
      const min = t.sogliaMin ? t.sogliaMin.toNumber() : 0;
      const max = t.sogliaMax ? t.sogliaMax.toNumber() : Infinity;
      return cilindrata >= min && cilindrata < max && t.unitaMisura === 'CC';
    });

    if (!tariffa || !tariffa.importoFisso) {
      result.note.push('Tariffa non trovata per questa cilindrata');
      return 0;
    }

    const importo = tariffa.importoFisso.toNumber();
    result.tariffeApplicate.push({
      descrizione: tariffa.descrizione || `${veicolo.tipoVeicolo} - cilindrata ${cilindrata} cc`,
      importo: importo,
      unitaMisura: 'FISSO',
      valore: null,
    });

    dettagli.push(`${veicolo.tipoVeicolo} - cilindrata ${cilindrata} cc`);
    dettagli.push(`Importo fisso: €${importo.toFixed(2)}`);

    return importo;
  }

  /**
   * Calcola bollo rimorchio (tassa fissa)
   */
  private calcolaRimorchio(
    veicolo: any,
    tariffe: any[],
    result: CalcolobolloResult,
    dettagli: string[],
  ): number {
    const tariffa = tariffe.find((t) => t.unitaMisura === 'FISSO');

    if (!tariffa || !tariffa.importoFisso) {
      result.note.push('Tariffa non trovata per questo tipo di rimorchio');
      return 0;
    }

    const importo = tariffa.importoFisso.toNumber();
    result.tariffeApplicate.push({
      descrizione: tariffa.descrizione || `${veicolo.tipoVeicolo} - tassa fissa`,
      importo: importo,
      unitaMisura: 'FISSO',
      valore: null,
    });

    dettagli.push(`${veicolo.tipoVeicolo}`);
    dettagli.push(`Tassa fissa: €${importo.toFixed(2)}`);

    return importo;
  }

  /**
   * Calcola bollo rimorchio trasporto persone (per numero posti)
   */
  private calcolaRimorchioPersone(
    veicolo: any,
    tariffe: any[],
    result: CalcolobolloResult,
    dettagli: string[],
  ): number {
    const numeroPosti = veicolo.numeroPosti || 0;

    if (numeroPosti === 0) {
      result.note.push('Numero posti non specificato, impossibile calcolare il bollo');
      return 0;
    }

    const tariffa = tariffe.find((t) => {
      const min = t.sogliaMin ? t.sogliaMin.toNumber() : 0;
      const max = t.sogliaMax ? t.sogliaMax.toNumber() : Infinity;
      return numeroPosti >= min && numeroPosti <= max && t.unitaMisura === 'POSTI';
    });

    if (!tariffa || !tariffa.importoFisso) {
      result.note.push('Tariffa non trovata per questo numero di posti');
      return 0;
    }

    const importo = tariffa.importoFisso.toNumber();
    result.tariffeApplicate.push({
      descrizione: tariffa.descrizione || `Rimorchio trasporto persone - ${numeroPosti} posti`,
      importo: importo,
      unitaMisura: 'FISSO',
      valore: null,
    });

    dettagli.push(`Rimorchio trasporto persone - ${numeroPosti} posti`);
    dettagli.push(`Importo fisso: €${importo.toFixed(2)}`);

    return importo;
  }

  /**
   * Calcola il bollo per tutti i veicoli di un cliente
   */
  async calcolaBolloPerCliente(
    idCliente: number,
    anno: number = new Date().getFullYear(),
  ): Promise<{ veicolo: any; calcolo: CalcolobolloResult }[]> {
    const veicoli = await this.prisma.veicolo.findMany({
      where: { idCliente },
      include: { cliente: true },
    });

    const risultati: { veicolo: any; calcolo: CalcolobolloResult }[] = [];

    for (const veicolo of veicoli) {
      try {
        const calcolo = await this.calcolaBollo(veicolo.id, anno);
        risultati.push({ veicolo, calcolo });
      } catch (error) {
        risultati.push({
          veicolo,
          calcolo: {
            importoBase: 0,
            importoRidotto: null,
            scontoRid: 0,
            tariffeApplicate: [],
            esenzioni: [],
            note: [`Errore nel calcolo: ${error.message}`],
            dettaglioCalcolo: '',
          },
        });
      }
    }

    return risultati;
  }

  /**
   * Ricalcola il bollo per tutte le scadenze future di un veicolo
   */
  async aggiornaImportiScadenze(idVeicolo: number): Promise<number> {
    const annoCorrente = new Date().getFullYear();

    // Trova tutte le scadenze future non pagate
    const scadenze = await this.prisma.scadenza.findMany({
      where: {
        idVeicolo,
        stato: 'DA_PAGARE',
        annoScadenza: { gte: annoCorrente },
      },
    });

    let aggiornate = 0;

    for (const scadenza of scadenze) {
      try {
        const calcolo = await this.calcolaBollo(
          idVeicolo,
          scadenza.annoScadenza,
          scadenza.periodicita as 'ANNUALE' | 'QUADRIMESTRALE',
        );

        await this.prisma.scadenza.update({
          where: { id: scadenza.id },
          data: { importoPrevisto: calcolo.importoBase },
        });

        aggiornate++;
      } catch (error) {
        console.error(`Errore aggiornamento scadenza ${scadenza.id}:`, error);
      }
    }

    return aggiornate;
  }
}
