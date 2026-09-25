import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Entità tracciate nel registro delle modifiche. */
export type EntitaAudit = 'scadenza' | 'pagamento' | 'veicolo' | 'cliente' | 'tariffa' | 'avviso' | 'utente' | 'report';

export type AzioneAudit = 'CREAZIONE' | 'MODIFICA' | 'ELIMINAZIONE' | 'ESPORTAZIONE';

export interface VoceAudit {
  entita: EntitaAudit;
  idEntita: number;
  azione: AzioneAudit;
  /** Email dell'utente che ha eseguito l'operazione, quando disponibile */
  utente?: string | null;
  datiPrima?: unknown;
  datiDopo?: unknown;
  note?: string;
}

/**
 * Registro append-only delle modifiche ai dati che incidono sugli importi.
 *
 * Risponde alla domanda "chi ha cambiato questo importo, quando, e da cosa a
 * cosa": senza una risposta, una contestazione su un bollo non è difendibile.
 *
 * Due scelte deliberate:
 *
 * 1. Il servizio espone solo scrittura e lettura, mai modifica o
 *    cancellazione: un registro riscrivibile non prova nulla.
 *
 * 2. Un errore nella scrittura del registro non fa fallire l'operazione
 *    di business. Perdere una riga di audit è meno grave che impedire la
 *    registrazione di un pagamento; l'errore viene però loggato.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Registra una modifica.
   *
   * @param tx - Client transazionale, quando la voce deve essere scritta
   *             nella stessa transazione dell'operazione tracciata.
   */
  async registra(voce: VoceAudit, tx?: { auditLog: { create: (args: unknown) => Promise<unknown> } }): Promise<void> {
    const client = tx ?? this.prisma;

    try {
      await client.auditLog.create({
        data: {
          entita: voce.entita,
          idEntita: voce.idEntita,
          azione: voce.azione,
          utente: voce.utente ?? null,
          datiPrima: this.serializza(voce.datiPrima),
          datiDopo: this.serializza(voce.datiDopo),
          note: voce.note,
        },
      } as never);
    } catch (error) {
      // Vedi nota 2 nella documentazione della classe.
      this.logger.error(
        `Impossibile registrare l'audit per ${voce.entita} ${voce.idEntita}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Storico delle modifiche di una singola entità, dalla più recente.
   */
  async storico(entita: EntitaAudit, idEntita: number, limite = 100) {
    return this.prisma.auditLog.findMany({
      where: { entita, idEntita },
      orderBy: { createdAt: 'desc' },
      take: limite,
    });
  }

  /**
   * Rende serializzabile in JSON un oggetto Prisma.
   *
   * Decimal e Date non sopravvivono a JSON.stringify nella forma attesa:
   * Decimal diventerebbe un oggetto con la rappresentazione interna e le date
   * perderebbero il tipo. Qui vengono convertiti in stringa, che è la forma
   * leggibile e stabile nel tempo per un registro destinato a essere riletto
   * anni dopo.
   */
  private serializza(valore: unknown): unknown {
    if (valore === undefined || valore === null) return undefined;

    return JSON.parse(
      JSON.stringify(valore, (_chiave, v) => {
        if (v === null || v === undefined) return v;
        if (v instanceof Date) return v.toISOString();
        // I Decimal di Prisma espongono toFixed: li serializziamo come stringa
        // per non perdere precisione passando dal numero in virgola mobile.
        if (typeof v === 'object' && typeof (v as { toFixed?: unknown }).toFixed === 'function') {
          return String(v);
        }
        if (typeof v === 'bigint') return v.toString();
        return v;
      }),
    );
  }
}
