import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PasswordComplessa } from '../politica-password';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'La password attuale è obbligatoria' })
  @MaxLength(128, { message: 'La password non può superare 128 caratteri' })
  currentPassword: string;

  @IsString()
  @IsNotEmpty({ message: 'La nuova password è obbligatoria' })
  @PasswordComplessa()
  newPassword: string;
}
