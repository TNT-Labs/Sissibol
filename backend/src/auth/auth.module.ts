import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ACCESS_TOKEN_EXPIRY, AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      // Durata e algoritmo fissati qui: ogni token ne ha comunque di propri
      // (accesso 15 minuti, refresh 7 giorni). JWT_EXPIRATION, un tempo letta
      // qui, non aveva effetto e non è più usata.
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: ACCESS_TOKEN_EXPIRY, algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
