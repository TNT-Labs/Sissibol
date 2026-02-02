import { IsEmail, IsEnum, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export enum Ruolo {
  ADMIN = 'ADMIN',
  OPERATORE = 'OPERATORE',
}

export class CreateUtenteDto {
  @IsEmail({}, { message: 'Email non valida' })
  @IsNotEmpty({ message: 'Email obbligatoria' })
  email: string;

  // BUG FIX: aggiunto MaxLength per evitare DoS con password enormi
  @IsNotEmpty({ message: 'Password obbligatoria' })
  @MinLength(6, { message: 'La password deve avere almeno 6 caratteri' })
  @MaxLength(128, { message: 'La password non può superare 128 caratteri' })
  password: string;

  @IsEnum(Ruolo, { message: 'Ruolo non valido' })
  ruolo: Ruolo = Ruolo.OPERATORE;
}
