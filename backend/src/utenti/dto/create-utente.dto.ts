import { IsEmail, IsEnum, IsNotEmpty, MinLength } from 'class-validator';

export enum Ruolo {
  ADMIN = 'ADMIN',
  OPERATORE = 'OPERATORE',
}

export class CreateUtenteDto {
  @IsEmail({}, { message: 'Email non valida' })
  @IsNotEmpty({ message: 'Email obbligatoria' })
  email: string;

  @IsNotEmpty({ message: 'Password obbligatoria' })
  @MinLength(6, { message: 'La password deve avere almeno 6 caratteri' })
  password: string;

  @IsEnum(Ruolo, { message: 'Ruolo non valido' })
  ruolo: Ruolo = Ruolo.OPERATORE;
}
