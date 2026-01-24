import { IsNotEmpty, IsString, IsOptional, IsEmail } from 'class-validator';

export class CreateClienteDto {
  @IsString()
  @IsNotEmpty()
  ragioneSociale: string;

  @IsString()
  @IsOptional()
  partitaIva?: string;

  @IsString()
  @IsOptional()
  indirizzo?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsString()
  @IsOptional()
  note?: string;
}
