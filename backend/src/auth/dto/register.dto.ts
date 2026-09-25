import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { PasswordComplessa } from '../politica-password';
import { Ruolo } from '../../prisma/types';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @PasswordComplessa()
  password: string;

  @IsEnum(Ruolo)
  @IsNotEmpty()
  ruolo: Ruolo;
}
