import { IsString, IsOptional, IsEmail, IsEnum, ValidateIf, IsBoolean } from 'class-validator';
import { TipoCliente } from '../../prisma/types';

export class UpdateClienteDto {
  @IsEnum(TipoCliente)
  @IsOptional()
  tipoCliente?: TipoCliente;

  @IsBoolean()
  @IsOptional()
  attivo?: boolean;

  // Campi Persona Giuridica
  @ValidateIf(o => o.tipoCliente === 'PERSONA_GIURIDICA')
  @IsString()
  @IsOptional()
  ragioneSociale?: string;

  @IsString()
  @IsOptional()
  partitaIva?: string;

  // Campi Persona Fisica
  @ValidateIf(o => o.tipoCliente === 'PERSONA_FISICA')
  @IsString()
  @IsOptional()
  nome?: string;

  @ValidateIf(o => o.tipoCliente === 'PERSONA_FISICA')
  @IsString()
  @IsOptional()
  cognome?: string;

  @IsString()
  @IsOptional()
  codiceFiscale?: string;

  // Campi comuni
  @IsString()
  @IsOptional()
  indirizzo?: string;

  @IsEmail({}, { message: 'Email non valida' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsString()
  @IsOptional()
  note?: string;
}
