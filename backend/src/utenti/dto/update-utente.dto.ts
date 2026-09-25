import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { PasswordComplessa } from '../../auth/politica-password';
import { Ruolo } from './create-utente.dto';

export class UpdateUtenteDto {
  @IsOptional()
  @IsEmail({}, { message: 'Email non valida' })
  email?: string;

  // Password provvisoria assegnata dall'amministratore: l'utente dovrà
  // cambiarla al primo accesso.
  @IsOptional()
  @PasswordComplessa()
  password?: string;

  @IsOptional()
  @IsEnum(Ruolo, { message: 'Ruolo non valido' })
  ruolo?: Ruolo;
}
