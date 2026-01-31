import { IsString, IsInt, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateVeicoloDto {
  @IsInt()
  @IsOptional()
  idCliente?: number;

  @IsString()
  @IsOptional()
  targa?: string;

  @IsString()
  @IsOptional()
  tipoVeicolo?: string;

  @IsString()
  @IsOptional()
  classeAmbientale?: string;

  @IsString()
  @IsOptional()
  regione?: string;

  @IsString()
  @IsOptional()
  alimentazione?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  potenzaKw?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  cilindrata?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  portataKg?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  pesoComplessivoKg?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  numeroAssi?: number;

  @IsString()
  @IsOptional()
  tipoSospensione?: string;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  numeroPosti?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  massaRimorchiabileKg?: number;

  @IsDateString()
  @IsOptional()
  dataImmatricolazione?: string;

  @IsString()
  @IsOptional()
  note?: string;
}
