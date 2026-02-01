import { IsNotEmpty, IsString, IsOptional, IsEmail, IsEnum, ValidateIf, IsBoolean } from 'class-validator';
import { TipoCliente } from '../../prisma/types';

export class CreateClienteDto {
  @IsEnum(TipoCliente)
  @IsOptional()
  tipoCliente?: TipoCliente;

  @IsBoolean()
  @IsOptional()
  attivo?: boolean;

  // Campi Persona Giuridica - obbligatori se tipoCliente è PERSONA_GIURIDICA
  @ValidateIf(o => o.tipoCliente === 'PERSONA_GIURIDICA' || !o.tipoCliente)
  @IsString()
  @IsNotEmpty({ message: 'La ragione sociale è obbligatoria per le persone giuridiche' })
  ragioneSociale?: string;

  @IsString()
  @IsOptional()
  partitaIva?: string;

  // Campi Persona Fisica - obbligatori se tipoCliente è PERSONA_FISICA
  @ValidateIf(o => o.tipoCliente === 'PERSONA_FISICA')
  @IsString()
  @IsNotEmpty({ message: 'Il nome è obbligatorio per le persone fisiche' })
  nome?: string;

  @ValidateIf(o => o.tipoCliente === 'PERSONA_FISICA')
  @IsString()
  @IsNotEmpty({ message: 'Il cognome è obbligatorio per le persone fisiche' })
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
