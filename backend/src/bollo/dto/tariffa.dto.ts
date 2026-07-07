import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsIn,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTariffaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tipoVeicolo: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  categoriaEuro?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  unitaMisura: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  sogliaMin?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  sogliaMax?: number;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  @Type(() => Number)
  importoUnitario: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  importoFisso?: number;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  tipoSospensione?: string;

  @IsIn(['ANNUALE', 'QUADRIMESTRALE'])
  @IsOptional()
  periodicita?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  descrizione?: string;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  ordine?: number;
}

export class UpdateTariffaDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  importoUnitario?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  importoFisso?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  descrizione?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  sogliaMin?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  sogliaMax?: number;
}
