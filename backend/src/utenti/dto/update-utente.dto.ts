import { IsEmail, IsEnum, IsOptional, MinLength, MaxLength } from 'class-validator';
import { Ruolo } from './create-utente.dto';

export class UpdateUtenteDto {
  @IsOptional()
  @IsEmail({}, { message: 'Email non valida' })
  email?: string;

  @IsOptional()
  @MinLength(6, { message: 'La password deve avere almeno 6 caratteri' })
  @MaxLength(128, { message: 'La password non può superare 128 caratteri' })
  password?: string;

  @IsOptional()
  @IsEnum(Ruolo, { message: 'Ruolo non valido' })
  ruolo?: Ruolo;
}
