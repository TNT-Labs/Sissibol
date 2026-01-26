import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  UseGuards,
  Request,
  UnauthorizedException,
  Headers,
  Ip,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Login - restituisce access_token e refresh_token
   */
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ) {
    const user = await this.authService.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Credenziali non valide');
    }
    return this.authService.login(user, { userAgent, ipAddress });
  }

  /**
   * Refresh token - rinnova access_token usando refresh_token
   */
  @Post('refresh')
  async refreshToken(
    @Body('refresh_token') refreshToken: string,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token mancante');
    }
    return this.authService.refreshTokens(refreshToken, { userAgent, ipAddress });
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
   */
  @Post('setup')
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
   * Logout - revoca il refresh token corrente
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Request() req) {
    const jti = req.user.jti;
    return this.authService.logout(req.user.id, jti);
  }

  /**
   * Logout da tutti i dispositivi
   */
  @Post('logout/all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(@Request() req) {
    return this.authService.logoutAll(req.user.id);
  }

  /**
   * Profilo utente corrente
   */
  @UseGuards(JwtAuthGuard)
  @Get('profile')
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
