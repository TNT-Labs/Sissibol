import { IsEmail, IsEnum, IsOptional, MinLength } from 'class-validator';
import { Ruolo } from './create-utente.dto';

export class UpdateUtenteDto {
  @IsOptional()
  @IsEmail({}, { message: 'Email non valida' })
  email?: string;

  @IsOptional()
  @MinLength(6, { message: 'La password deve avere almeno 6 caratteri' })
  password?: string;

  @IsOptional()
  @IsEnum(Ruolo, { message: 'Ruolo non valido' })
  ruolo?: Ruolo;
}
