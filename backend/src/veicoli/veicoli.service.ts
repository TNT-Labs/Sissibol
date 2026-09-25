import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BolloService } from '../bollo/bollo.service';
import { AuditService } from '../audit/audit.service';
import { CAMPI_CALCOLO } from './domini';
import { CreateVeicoloDto } from './dto/create-veicolo.dto';
import { UpdateVeicoloDto } from './dto/update-veicolo.dto';

// Tipi per lo storico veicolo (corrispondono all'enum nel schema.prisma)
type TipoModificaVeicolo = 'CAMBIO_TARGA' | 'CAMBIO_PROPRIETARIO' | 'CAMBIO_TARGA_E_PROPRIETARIO';

@Injectable()
export class VeicoliService {
  private readonly logger = new Logger(VeicoliService.name);

  constructor(
    private prisma: PrismaService,
    private bollo: BolloService,
    private audit: AuditService,
  ) {}

  async create(createVeicoloDto: CreateVeicoloDto) {
    // Converti dataImmatricolazione da stringa a Date se presente
    const data: any = { ...createVeicoloDto };
    if (data.dataImmatricolazione) {
      data.dataImmatricolazione = new Date(data.dataImmatricolazione);
    }

    return this.prisma.veicolo.create({
      data,
      include: {
        cliente: true,
      },
    });
  }

  async findAll(idCliente?: number, search?: string) {
    const where: any = {
      // Filtra solo veicoli attivi di clienti attivi
      attivo: true,
      cliente: {
        attivo: true,
      },
    };

    if (idCliente) {
      where.idCliente = idCliente;
    }

    if (search) {
      where.OR = [
        { targa: { contains: search, mode: 'insensitive' } },
        { cliente: { ragioneSociale: { contains: search, mode: 'insensitive' }, attivo: true } },
        { cliente: { nome: { contains: search, mode: 'insensitive' }, attivo: true } },
        { cliente: { cognome: { contains: search, mode: 'insensitive' }, attivo: true } },
      ];
    }

    return this.prisma.veicolo.findMany({
      where,
      select: {
        id: true,
        targa: true,
        tipoVeicolo: true,
        classeAmbientale: true,
        regione: true,
        potenzaKw: true,
        cilindrata: true,
        alimentazione: true,
        dataImmatricolazione: true,
        cliente: {
          select: {
            id: true,
            tipoCliente: true,
            ragioneSociale: true,
            nome: true,
            cognome: true,
            attivo: true,
          },
        },
        _count: {
          select: { scadenze: true },
        },
      },
      orderBy: {
        targa: 'asc',
      },
    });
  }

  async findAllPaginated(
    page: number = 1,
    pageSize: number = 50,
    idCliente?: number,
    search?: string,
    attivo: boolean = true,
  ) {
    const skip = (page - 1) * pageSize;

    const where: any = {
      // Filtra per stato attivo del veicolo e solo clienti attivi
      attivo,
      cliente: {
        attivo: true,
      },
    };

    if (idCliente) {
      where.idCliente = idCliente;
    }

    if (search) {
      where.OR = [
        { targa: { contains: search, mode: 'insensitive' } },
        { cliente: { ragioneSociale: { contains: search, mode: 'insensitive' }, attivo: true } },
        { cliente: { nome: { contains: search, mode: 'insensitive' }, attivo: true } },
        { cliente: { cognome: { contains: search, mode: 'insensitive' }, attivo: true } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.veicolo.findMany({
        where,
        select: {
          id: true,
          targa: true,
          tipoVeicolo: true,
          classeAmbientale: true,
          regione: true,
          potenzaKw: true,
          cilindrata: true,
          alimentazione: true,
          dataImmatricolazione: true,
          cliente: {
            select: {
              id: true,
              tipoCliente: true,
              ragioneSociale: true,
              nome: true,
              cognome: true,
              attivo: true,
            },
          },
          _count: {
            select: { scadenze: true },
          },
        },
        orderBy: {
          targa: 'asc',
        },
        skip,
        take: pageSize,
      }),
      this.prisma.veicolo.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: number) {
    const veicolo = await this.prisma.veicolo.findUnique({
      where: { id },
      include: {
        cliente: true,
        scadenze: {
          include: {
            pagamenti: true,
          },
          orderBy: [
            { annoScadenza: 'desc' },
            { meseScadenza: 'desc' },
          ],
        },
      },
    });

    if (!veicolo) {
      throw new NotFoundException(`Veicolo con ID ${id} non trovato`);
    }

    return veicolo;
  }

  /**
   * Aggiorna un veicolo tracciando le modifiche a targa e proprietario.
   *
   * @param id - ID del veicolo
   * @param updateVeicoloDto - Dati da aggiornare
   * @param utenteEmail - Email utente per audit (opzionale)
   * @param motivazione - Motivo della modifica (opzionale)
   */
  async update(
    id: number,
    updateVeicoloDto: UpdateVeicoloDto,
    utenteEmail?: string,
    motivazione?: string,
  ) {
    const prima = await this.prisma.veicolo.findUnique({ where: { id } });
    const veicolo = await this.aggiornaVeicolo(id, updateVeicoloDto, utenteEmail, motivazione);
    await this.registraCampiCalcolo(prima, veicolo, utenteEmail);

    // Completati i dati che servono al calcolo, le scadenze future ancora
    // senza importo lo ricevono subito. Gli importi esistenti (archivio o
    // inseriti a mano) non vengono toccati: ricalcolarli resta una scelta
    // esplicita (POST /bollo/aggiorna-scadenze/:idVeicolo).
    const toccaIlCalcolo = CAMPI_CALCOLO.some(
      (campo) => (updateVeicoloDto as Record<string, unknown>)[campo] !== undefined,
    );
    if (!toccaIlCalcolo) {
      return { ...veicolo, importiCompletati: 0 };
    }
    try {
      const esito = await this.bollo.completaImportiMancanti(id, utenteEmail);
      return { ...veicolo, importiCompletati: esito.aggiornate };
    } catch (error) {
      // Il veicolo è già salvato: un errore nel calcolo non deve far credere
      // all'utente che la modifica sia fallita.
      this.logger.error(`Importi non completati per il veicolo ${id}: ${(error as Error).message}`);
      return { ...veicolo, importiCompletati: 0 };
    }
  }

  /**
   * Imposta lo stesso valore di un campo su più veicoli: una flotta ha spesso
   * molti mezzi dello stesso tipo. Passa da update(), quindi registra ogni
   * modifica e completa gli importi mancanti di ciascun veicolo.
   */
  async impostaCampo(
    idVeicoli: number[],
    campo: string,
    valore: string | null,
    utenteEmail?: string,
  ): Promise<{ aggiornati: number; importiCompletati: number; nonTrovati: number[] }> {
    const esistenti = new Set(
      (await this.prisma.veicolo.findMany({ where: { id: { in: idVeicoli } }, select: { id: true } })).map(
        (v) => v.id,
      ),
    );
    const esito = { aggiornati: 0, importiCompletati: 0, nonTrovati: idVeicoli.filter((id) => !esistenti.has(id)) };
    for (const id of idVeicoli.filter((i) => esistenti.has(i))) {
      const aggiornato = await this.update(id, { [campo]: valore } as UpdateVeicoloDto, utenteEmail);
      esito.aggiornati++;
      esito.importiCompletati += aggiornato.importiCompletati;
    }
    return esito;
  }

  /**
   * Registra le modifiche ai dati che entrano nel calcolo del bollo: cambiano
   * l'importo, e una contestazione chiede chi li ha cambiati e da quale valore.
   */
  private async registraCampiCalcolo(
    prima: Record<string, unknown> | null,
    dopo: Record<string, unknown>,
    utente?: string,
  ) {
    if (!prima) return;
    const comeTesto = (v: unknown) =>
      v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    const cambiati = CAMPI_CALCOLO.filter((c) => comeTesto(prima[c]) !== comeTesto(dopo[c]));
    if (cambiati.length === 0) return;
    await this.audit.registra({
      entita: 'veicolo',
      idEntita: dopo.id as number,
      azione: 'MODIFICA',
      utente,
      datiPrima: Object.fromEntries(cambiati.map((c) => [c, comeTesto(prima[c])])),
      datiDopo: Object.fromEntries(cambiati.map((c) => [c, comeTesto(dopo[c])])),
      note: 'Dati di calcolo del bollo modificati',
    });
  }

  private async aggiornaVeicolo(
    id: number,
    updateVeicoloDto: UpdateVeicoloDto,
    utenteEmail?: string,
    motivazione?: string,
  ) {
    const veicoloCorrente = await this.findOne(id);

    // Converti dataImmatricolazione da stringa a Date se presente
    const updateData: any = { ...updateVeicoloDto };
    if (updateData.dataImmatricolazione) {
      updateData.dataImmatricolazione = new Date(updateData.dataImmatricolazione);
    }

    // Rileva cambiamenti significativi
    const cambioTarga =
      updateVeicoloDto.targa !== undefined &&
      updateVeicoloDto.targa !== veicoloCorrente.targa;

    const cambioProprietario =
      updateVeicoloDto.idCliente !== undefined &&
      updateVeicoloDto.idCliente !== veicoloCorrente.idCliente;

    // Se ci sono cambiamenti significativi, usa una transazione
    if (cambioTarga || cambioProprietario) {
      return this.prisma.$transaction(async (tx) => {
        // Determina il tipo di modifica
        let tipoModifica: TipoModificaVeicolo;
        if (cambioTarga && cambioProprietario) {
          tipoModifica = 'CAMBIO_TARGA_E_PROPRIETARIO';
        } else if (cambioTarga) {
          tipoModifica = 'CAMBIO_TARGA';
        } else {
          tipoModifica = 'CAMBIO_PROPRIETARIO';
        }

        // Registra lo storico
        await tx.storicoVeicolo.create({
          data: {
            idVeicolo: id,
            tipoModifica,
            targaPrecedente: cambioTarga ? veicoloCorrente.targa : null,
            targaNuova: cambioTarga ? updateVeicoloDto.targa : null,
            idClientePrecedente: cambioProprietario
              ? veicoloCorrente.idCliente
              : null,
            idClienteNuovo: cambioProprietario
              ? updateVeicoloDto.idCliente
              : null,
            motivazione: motivazione || null,
            utenteModifica: utenteEmail || null,
          },
        });

        // Aggiorna il veicolo
        return tx.veicolo.update({
          where: { id },
          data: updateData,
          include: {
            cliente: true,
          },
        });
      });
    }

    // Nessun cambio significativo: update semplice
    return this.prisma.veicolo.update({
      where: { id },
      data: updateData,
      include: {
        cliente: true,
      },
    });
  }

  /**
   * Recupera lo storico modifiche di un veicolo
   */
  async getStorico(idVeicolo: number) {
    await this.findOne(idVeicolo); // Check if exists

    return this.prisma.storicoVeicolo.findMany({
      where: { idVeicolo },
      orderBy: { dataModifica: 'desc' },
    });
  }

  /**
   * Soft-delete: disattiva il veicolo preservando scadenze e pagamenti.
   */
  async remove(id: number) {
    await this.findOne(id); // Check if exists

    return this.prisma.veicolo.update({
      where: { id },
      data: { attivo: false },
    });
  }

  /**
   * Eliminazione definitiva (solo ADMIN): cancella a cascata scadenze e pagamenti.
   */
  async removeHard(id: number, isAdmin: boolean) {
    if (!isAdmin) {
      throw new ForbiddenException(
        'Solo gli amministratori possono eliminare definitivamente un veicolo',
      );
    }
    await this.findOne(id); // Check if exists

    return this.prisma.veicolo.delete({
      where: { id },
    });
  }
}
