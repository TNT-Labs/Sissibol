import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { randomUUID } from 'crypto';
import { problemiPassword } from './politica-password';

// Durata token
const ACCESS_TOKEN_EXPIRY = '15m';  // Access token breve
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

/** Errori di password consecutivi prima della sospensione dell'accesso. */
export const MAX_TENTATIVI_FALLITI = 5;
/** Durata della sospensione dopo troppi errori. */
export const MINUTI_BLOCCO = 15;
/** Costo di bcrypt per le nuove password (circa 250 ms per verifica). */
const COSTO_BCRYPT = 12;

/**
 * Hash di confronto per le email inesistenti: la verifica richiede lo stesso
 * tempo che per un utente vero, così i tempi di risposta non rivelano quali
 * email hanno un account.
 */
const HASH_FITTIZIO = bcrypt.hashSync('verifica-tempo-costante-senza-utente', COSTO_BCRYPT);

/** Tipo del token: un refresh token non deve valere come token di accesso. */
export type TipoToken = 'access' | 'refresh';

interface TokenPayload {
  email: string;
  sub: number;
  ruolo: string;
  jti?: string;
  typ: TipoToken;
}

interface LoginMetadata {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private audit: AuditService,
  ) {}

  /**
   * Verifica email e password, con sospensione temporanea dell'accesso dopo
   * MAX_TENTATIVI_FALLITI errori consecutivi.
   *
   * Restituisce l'utente o null, senza mai dire perché: email inesistente,
   * password errata e account sospeso danno la stessa risposta nello stesso
   * tempo, così un attaccante non può scoprire quali account esistono.
   */
  async verificaCredenziali(email: string, password: string, ip?: string): Promise<any> {
    const user = await this.prisma.utente.findUnique({ where: { email } });

    if (!user) {
      await bcrypt.compare(password, HASH_FITTIZIO);
      this.logger.warn(`Accesso fallito: email sconosciuta (${email}) da ${ip ?? '?'}`);
      return null;
    }

    if (user.bloccatoFinoA && user.bloccatoFinoA > new Date()) {
      await bcrypt.compare(password, HASH_FITTIZIO);
      this.logger.warn(`Accesso rifiutato: account ${email} sospeso fino alle ${user.bloccatoFinoA.toISOString()} (da ${ip ?? '?'})`);
      return null;
    }

    if (!(await bcrypt.compare(password, user.password))) {
      const aggiornato = await this.prisma.utente.update({
        where: { id: user.id },
        data: { tentativiFalliti: { increment: 1 } },
      });
      if (aggiornato.tentativiFalliti >= MAX_TENTATIVI_FALLITI) {
        const fino = new Date(Date.now() + MINUTI_BLOCCO * 60_000);
        await this.prisma.utente.update({
          where: { id: user.id },
          data: { bloccatoFinoA: fino, tentativiFalliti: 0 },
        });
        this.logger.warn(`Account ${email} sospeso per ${MINUTI_BLOCCO} minuti dopo ${MAX_TENTATIVI_FALLITI} errori (ultimo da ${ip ?? '?'})`);
        await this.audit.registra({
          entita: 'utente',
          idEntita: user.id,
          azione: 'MODIFICA',
          datiDopo: { bloccatoFinoA: fino },
          note: `Accesso sospeso dopo ${MAX_TENTATIVI_FALLITI} password errate (ultimo tentativo da ${ip ?? 'IP sconosciuto'})`,
        });
      } else {
        this.logger.warn(`Accesso fallito: password errata per ${email} da ${ip ?? '?'}`);
      }
      return null;
    }

    if (user.tentativiFalliti > 0 || user.bloccatoFinoA) {
      await this.prisma.utente.update({
        where: { id: user.id },
        data: { tentativiFalliti: 0, bloccatoFinoA: null },
      });
    }

    const { password: _hash, ...result } = user;
    return result;
  }

  /**
   * Login con generazione di access token e refresh token
   */
  async login(user: any, metadata?: LoginMetadata) {
    const jti = randomUUID();
    const payload: TokenPayload = {
      email: user.email,
      sub: user.id,
      ruolo: user.ruolo,
      jti,
      typ: 'access',
    };

    // Access token con scadenza breve
    const accessToken = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_EXPIRY });

    // Refresh token con scadenza lunga
    const refreshTokenPayload = { sub: user.id, jti, typ: 'refresh' as TipoToken };
    const refreshToken = this.jwtService.sign(refreshTokenPayload, {
      expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d`,
    });

    // Salva refresh token hash in DB
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: await bcrypt.hash(refreshToken, 10),
        jti,
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
        expiresAt,
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 900, // 15 minuti in secondi
      token_type: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        ruolo: user.ruolo,
        deveCambiarePassword: !!user.deveCambiarePassword,
      },
    };
  }

  /**
   * Rinnova i token usando il refresh token
   */
  async refreshTokens(refreshToken: string, metadata?: LoginMetadata) {
    try {
      // Verifica e decodifica il refresh token
      const payload = this.jwtService.verify(refreshToken);
      // Solo un refresh token può rinnovare la sessione (e i refresh token
      // emessi prima dell'introduzione del tipo non valgono più).
      if (payload.typ !== 'refresh') {
        throw new UnauthorizedException('Refresh token non valido o scaduto');
      }

      // Verifica che il refresh token esista e non sia revocato
      const storedToken = await this.prisma.refreshToken.findFirst({
        where: {
          userId: payload.sub,
          jti: payload.jti,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (!storedToken) {
        throw new UnauthorizedException('Refresh token non valido o revocato');
      }

      // Confronta il token presentato con l'hash salvato: la sola firma JWT
      // non basta se il segreto fosse compromesso o il token forgiato con
      // lo stesso jti di una sessione valida
      const hashValido = await bcrypt.compare(refreshToken, storedToken.tokenHash);
      if (!hashValido) {
        // Possibile furto/riuso: revoca la sessione per sicurezza
        await this.prisma.refreshToken.update({
          where: { id: storedToken.id },
          data: { revokedAt: new Date() },
        });
        throw new UnauthorizedException('Refresh token non valido o revocato');
      }

      // Ottieni utente
      const user = await this.prisma.utente.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('Utente non trovato');
      }

      // Revoca vecchio token (rotation)
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });

      // Genera nuovi token
      const { password, ...userWithoutPassword } = user;
      return this.login(userWithoutPassword, metadata);

    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Refresh token non valido o scaduto');
    }
  }

  /**
   * Logout - revoca il refresh token corrente
   */
  async logout(userId: number, jti?: string) {
    const where: any = {
      userId,
      revokedAt: null,
    };

    if (jti) {
      where.jti = jti;
    }

    await this.prisma.refreshToken.updateMany({
      where,
      data: { revokedAt: new Date() },
    });

    return { message: 'Logout effettuato con successo' };
  }

  /**
   * Logout da tutti i dispositivi - revoca tutti i refresh token
   */
  async logoutAll(userId: number) {
    const result = await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return {
      message: 'Logout da tutti i dispositivi effettuato',
      sessionsRevoked: result.count,
    };
  }

  /**
   * Registrazione - protetta, solo admin può creare nuovi utenti
   * Eccezione: primo utente del sistema (setup iniziale)
   *
   * BUG FIX: Usa transazione serializable per prevenire race condition
   * nel setup iniziale (due richieste simultanee potrebbero entrambe
   * pensare di essere il primo utente)
   */
  async register(registerDto: RegisterDto, isAdmin: boolean = false) {
    // Usa transazione per prevenire race condition nel setup iniziale
    return this.prisma.$transaction(async (tx) => {
      // Verifica se è il primo utente (setup iniziale)
      const userCount = await tx.utente.count();
      const isInitialSetup = userCount === 0;

      // Se non è setup iniziale e non è admin, nega accesso
      if (!isInitialSetup && !isAdmin) {
        throw new ForbiddenException(
          'Solo gli amministratori possono creare nuovi utenti. ' +
          'Contatta un amministratore per richiedere un account.',
        );
      }

      const existingUser = await tx.utente.findUnique({
        where: { email: registerDto.email },
      });

      if (existingUser) {
        throw new ConflictException('Email già registrata');
      }

      const problemi = problemiPassword(registerDto.password, registerDto.email);
      if (problemi.length) {
        throw new BadRequestException(`Password non abbastanza sicura: ${problemi.join('; ')}`);
      }

      const hashedPassword = await bcrypt.hash(registerDto.password, COSTO_BCRYPT);

      // Primo utente è sempre ADMIN
      const ruolo = isInitialSetup ? 'ADMIN' : registerDto.ruolo;

      const user = await tx.utente.create({
        data: {
          email: registerDto.email,
          password: hashedPassword,
          ruolo: ruolo as any,
          // Una password scelta da un amministratore va cambiata dall'utente;
          // al setup iniziale l'ha scelta l'utente stesso.
          deveCambiarePassword: !isInitialSetup,
        },
      });

      const { password, ...result } = user;
      return {
        ...result,
        isInitialSetup,
      };
    }, {
      // Isolation level serializable per massima sicurezza
      isolationLevel: 'Serializable',
    });
  }

  /**
   * Verifica se è necessario il setup iniziale (nessun utente nel sistema)
   */
  async checkInitialSetup(): Promise<{ required: boolean }> {
    const userCount = await this.prisma.utente.count();
    return { required: userCount === 0 };
  }

  /**
   * Cambio password: verifica la password attuale, aggiorna l'hash e
   * revoca tutte le altre sessioni (mantiene attiva quella corrente).
   */
  async changePassword(
    userId: number,
    dto: { currentPassword: string; newPassword: string },
    currentJti?: string,
  ) {
    const user = await this.prisma.utente.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Utente non trovato');
    }

    const passwordValida = await bcrypt.compare(dto.currentPassword, user.password);
    if (!passwordValida) {
      this.logger.warn(`Cambio password rifiutato: password attuale errata per ${user.email}`);
      throw new UnauthorizedException('Password attuale non corretta');
    }

    const problemi = problemiPassword(dto.newPassword, user.email);
    if (problemi.length) {
      throw new BadRequestException(`Password non abbastanza sicura: ${problemi.join('; ')}`);
    }
    if (await bcrypt.compare(dto.newPassword, user.password)) {
      throw new BadRequestException('La nuova password deve essere diversa da quella attuale');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, COSTO_BCRYPT);

    const [, revoked] = await this.prisma.$transaction([
      this.prisma.utente.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
          deveCambiarePassword: false,
          passwordCambiataIl: new Date(),
          tentativiFalliti: 0,
          bloccatoFinoA: null,
        },
      }),
      // Revoca tutte le sessioni tranne quella corrente
      this.prisma.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(currentJti ? { jti: { not: currentJti } } : {}),
        },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Nel registro solo il fatto, mai la password né il suo hash.
    await this.audit.registra({
      entita: 'utente',
      idEntita: userId,
      azione: 'MODIFICA',
      utente: user.email,
      note: `Password cambiata dall'utente; ${revoked.count} altre sessioni chiuse`,
    });

    return {
      message: 'Password aggiornata con successo',
      altreSessioniRevocate: revoked.count,
    };
  }

  async getProfile(userId: number) {
    const user = await this.prisma.utente.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        ruolo: true,
        deveCambiarePassword: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Utente non trovato');
    }

    return user;
  }

  /**
   * Lista sessioni attive per un utente
   */
  async getActiveSessions(userId: number) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions;
  }

  /**
   * Revoca una sessione specifica
   */
  async revokeSession(userId: number, sessionId: number) {
    const session = await this.prisma.refreshToken.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
    });

    if (!session) {
      throw new UnauthorizedException('Sessione non trovata');
    }

    await this.prisma.refreshToken.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    return { message: 'Sessione revocata con successo' };
  }
}
