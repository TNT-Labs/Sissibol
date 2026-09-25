import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email: string;

  // Nessun controllo di complessità qui: si verifica la password esistente.
  // Il limite evita di far calcolare bcrypt su input enormi.
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
