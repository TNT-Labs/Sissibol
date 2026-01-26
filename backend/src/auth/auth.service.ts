import { Injectable, UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { randomUUID } from 'crypto';

// Durata token
const ACCESS_TOKEN_EXPIRY = '15m';  // Access token breve
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

interface TokenPayload {
  email: string;
  sub: number;
  ruolo: string;
  jti?: string;
}

interface LoginMetadata {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.utente.findUnique({
      where: { email },
    });

    if (user && await bcrypt.compare(password, user.password)) {
      const { password, ...result } = user;
      return result;
    }
    return null;
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
    };

    // Access token con scadenza breve
    const accessToken = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_EXPIRY });

    // Refresh token con scadenza lunga
    const refreshTokenPayload = { sub: user.id, jti };
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
   */
  async register(registerDto: RegisterDto, isAdmin: boolean = false) {
    // Verifica se è il primo utente (setup iniziale)
    const userCount = await this.prisma.utente.count();
    const isInitialSetup = userCount === 0;

    // Se non è setup iniziale e non è admin, nega accesso
    if (!isInitialSetup && !isAdmin) {
      throw new ForbiddenException(
        'Solo gli amministratori possono creare nuovi utenti. ' +
        'Contatta un amministratore per richiedere un account.',
      );
    }

    const existingUser = await this.prisma.utente.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email già registrata');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Primo utente è sempre ADMIN
    const ruolo = isInitialSetup ? 'ADMIN' : registerDto.ruolo;

    const user = await this.prisma.utente.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        ruolo: ruolo as any,
      },
    });

    const { password, ...result } = user;
    return {
      ...result,
      isInitialSetup,
    };
  }

  /**
   * Verifica se è necessario il setup iniziale (nessun utente nel sistema)
   */
  async checkInitialSetup(): Promise<{ required: boolean }> {
    const userCount = await this.prisma.utente.count();
    return { required: userCount === 0 };
  }

  async getProfile(userId: number) {
    const user = await this.prisma.utente.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        ruolo: true,
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
