import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { PasswordComplessa } from '../../auth/politica-password';

export enum Ruolo {
  ADMIN = 'ADMIN',
  OPERATORE = 'OPERATORE',
}

export class CreateUtenteDto {
  @IsEmail({}, { message: 'Email non valida' })
  @IsNotEmpty({ message: 'Email obbligatoria' })
  email: string;

  // Password provvisoria: l'utente dovrà cambiarla al primo accesso. Deve
  // comunque essere robusta, perché fino ad allora protegge l'account.
  @IsNotEmpty({ message: 'Password obbligatoria' })
  @PasswordComplessa()
  password: string;

  @IsEnum(Ruolo, { message: 'Ruolo non valido' })
  ruolo: Ruolo = Ruolo.OPERATORE;
}
