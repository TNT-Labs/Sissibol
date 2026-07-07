import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'La password attuale è obbligatoria' })
  currentPassword: string;

  @IsString()
  @IsNotEmpty({ message: 'La nuova password è obbligatoria' })
  @MinLength(6, { message: 'La password deve avere almeno 6 caratteri' })
  @MaxLength(128, { message: 'La password non può superare 128 caratteri' })
  newPassword: string;
}
