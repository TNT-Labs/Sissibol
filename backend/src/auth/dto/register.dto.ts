import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { Ruolo } from '../../prisma/types';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  // BUG FIX: aggiunto MaxLength per evitare DoS con password enormi
  @IsString()
  @MinLength(6, { message: 'La password deve avere almeno 6 caratteri' })
  @MaxLength(128, { message: 'La password non può superare 128 caratteri' })
  @IsNotEmpty()
  password: string;

  @IsEnum(Ruolo)
  @IsNotEmpty()
  ruolo: Ruolo;
}
