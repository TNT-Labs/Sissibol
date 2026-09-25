import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  /**
   * Il token dice chi è l'utente; il database dice se può ancora entrare.
   * Un utente eliminato perde l'accesso subito (non alla scadenza del token),
   * il ruolo è quello attuale e non quello del momento del login, e il cambio
   * password obbligatorio vale da subito.
   */
  async validate(payload: { sub: number; jti?: string; typ?: string }) {
    // Un refresh token non vale come token di accesso.
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Token non valido');
    }
    const utente = await this.prisma.utente.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, ruolo: true, deveCambiarePassword: true },
    });
    if (!utente) {
      throw new UnauthorizedException('Utente non più esistente');
    }
    return {
      id: utente.id,
      email: utente.email,
      ruolo: utente.ruolo,
      deveCambiarePassword: utente.deveCambiarePassword,
      jti: payload.jti,
    };
  }
}
