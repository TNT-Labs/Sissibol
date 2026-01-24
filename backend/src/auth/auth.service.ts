import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';

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

  async login(user: any) {
    const payload = { email: user.email, sub: user.id, ruolo: user.ruolo };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        ruolo: user.ruolo,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.utente.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email già registrata');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const user = await this.prisma.utente.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        ruolo: registerDto.ruolo,
      },
    });

    const { password, ...result } = user;
    return result;
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
}
