import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  UseGuards,
  Request,
  Response,
  UnauthorizedException,
  Headers,
  Ip,
  ParseIntPipe,
} from '@nestjs/common';
import type { Response as ExpressResponse, Request as ExpressRequest } from 'express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService, MAX_TENTATIVI_FALLITI, MINUTI_BLOCCO } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { ConsentitoConPasswordDaCambiare } from './decorators/password-da-cambiare.decorator';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 giorni, allineato a REFRESH_TOKEN_EXPIRY_DAYS

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Refresh token in cookie httpOnly: non leggibile da JavaScript, quindi non
   * esfiltrabile via XSS, e mai restituito nel corpo della risposta.
   *
   * - SameSite=Strict: il browser non lo invia in richieste partite da altri siti.
   * - Secure: solo su HTTPS (COOKIE_SECURE=false solo per l'installazione HTTP
   *   in rete locale, dove altrimenti il browser lo scarterebbe).
   * - Path: limitato alle rotte di autenticazione così come le vede il browser
   *   (COOKIE_PATH, es. /bolli/api/auth dietro Cloudflare): il cookie non
   *   viaggia con le altre richieste.
   */
  private opzioniCookie() {
    return {
      httpOnly: true,
      sameSite: 'strict' as const,
      secure: process.env.COOKIE_SECURE
        ? process.env.COOKIE_SECURE === 'true'
        : process.env.NODE_ENV === 'production',
      path: process.env.COOKIE_PATH || '/',
    };
  }

  private setRefreshCookie(res: ExpressResponse, refreshToken: string) {
    res.cookie(REFRESH_COOKIE, refreshToken, { ...this.opzioniCookie(), maxAge: REFRESH_COOKIE_MAX_AGE_MS });
  }

  private clearRefreshCookie(res: ExpressResponse) {
    const opzioni = this.opzioniCookie();
    res.clearCookie(REFRESH_COOKIE, opzioni);
    // Le versioni precedenti usavano il percorso '/': anche quel cookie va tolto.
    if (opzioni.path !== '/') res.clearCookie(REFRESH_COOKIE, { ...opzioni, path: '/' });
  }

  /** Risposta al browser: il refresh token resta solo nel cookie. */
  private senzaRefreshToken<T extends { refresh_token?: string }>(risultato: T) {
    const { refresh_token: _nascosto, ...corpo } = risultato;
    return corpo;
  }

  /**
   * Login - restituisce access_token e imposta il refresh token in cookie httpOnly
   * BUG FIX: Rate limiting restrittivo per prevenire brute force
   * Max 5 tentativi per minuto, 20 per ora per IP
   */
  @Post('login')
  // Il nome deve essere uno dei limitatori configurati in AppModule (short,
  // medium, long): con "default", che non esiste, il limite non si applicava.
  @Throttle({ medium: { limit: 5, ttl: 60000 } }) // 5 tentativi al minuto per IP
  async login(
    @Body() loginDto: LoginDto,
    @Response({ passthrough: true }) res: ExpressResponse,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ) {
    const user = await this.authService.verificaCredenziali(loginDto.email, loginDto.password, ipAddress);
    if (!user) {
      // Stesso messaggio per email inesistente, password errata e account
      // sospeso: non si rivela quali account esistono.
      throw new UnauthorizedException(
        `Credenziali non valide. Dopo ${MAX_TENTATIVI_FALLITI} tentativi errati l'accesso viene sospeso per ${MINUTI_BLOCCO} minuti.`,
      );
    }
    const result = await this.authService.login(user, { userAgent, ipAddress });
    this.setRefreshCookie(res, result.refresh_token);
    return this.senzaRefreshToken(result);
  }

  /**
   * Refresh token - rinnova access_token usando il refresh token.
   * Legge prima dal cookie httpOnly; il body resta supportato per
   * compatibilità con client API non browser.
   */
  @Post('refresh')
  async refreshToken(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
    @Body('refresh_token') refreshTokenBody?: string,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE] || refreshTokenBody;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token mancante');
    }
    const result = await this.authService.refreshTokens(refreshToken, { userAgent, ipAddress });
    this.setRefreshCookie(res, result.refresh_token);
    return this.senzaRefreshToken(result);
  }

  /**
   * Registrazione - protetta, solo admin può creare nuovi utenti
   * Eccezione: setup iniziale (primo utente del sistema)
   */
  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto, true);
  }

  /**
   * Setup iniziale - crea il primo utente ADMIN
   * Funziona solo se non esistono utenti nel sistema
   * BUG FIX: Rate limiting molto restrittivo per prevenire abuse
   */
  @Post('setup')
  @Throttle({ medium: { limit: 3, ttl: 60000 } }) // 3 tentativi al minuto
  async initialSetup(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto, false);
  }

  /**
   * Verifica se è necessario il setup iniziale
   */
  @Get('setup/check')
  async checkSetup() {
    return this.authService.checkInitialSetup();
  }

  /**
   * Logout - revoca il refresh token corrente e cancella il cookie
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ConsentitoConPasswordDaCambiare()
  async logout(@Request() req, @Response({ passthrough: true }) res: ExpressResponse) {
    const jti = req.user.jti;
    this.clearRefreshCookie(res);
    return this.authService.logout(req.user.id, jti);
  }

  /**
   * Logout da tutti i dispositivi
   */
  @Post('logout/all')
  @UseGuards(JwtAuthGuard)
  @ConsentitoConPasswordDaCambiare()
  async logoutAll(@Request() req, @Response({ passthrough: true }) res: ExpressResponse) {
    this.clearRefreshCookie(res);
    return this.authService.logoutAll(req.user.id);
  }

  /**
   * Cambio password dell'utente corrente.
   * Verifica la password attuale e revoca le altre sessioni attive.
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ConsentitoConPasswordDaCambiare()
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  async changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto, req.user.jti);
  }

  /**
   * Profilo utente corrente
   */
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ConsentitoConPasswordDaCambiare()
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.id);
  }

  /**
   * Lista sessioni attive dell'utente corrente
   */
  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  async getSessions(@Request() req) {
    return this.authService.getActiveSessions(req.user.id);
  }

  /**
   * Revoca una sessione specifica
   */
  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  async revokeSession(
    @Request() req,
    @Param('id', ParseIntPipe) sessionId: number,
  ) {
    return this.authService.revokeSession(req.user.id, sessionId);
  }
}
