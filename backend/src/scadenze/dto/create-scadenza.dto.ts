import { IsNotEmpty, IsInt, IsEnum, IsOptional, Min, Max } from 'class-validator';
import { StatoScadenza, Periodicita } from '../../prisma/types';
import { Type } from 'class-transformer';

export class CreateScadenzaDto {
  @IsInt()
  @IsNotEmpty()
  idVeicolo: number;

  @IsInt()
  @Min(1)
  @Max(12)
  @IsNotEmpty()
  meseScadenza: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsNotEmpty()
  annoScadenza: number;

  @IsEnum(Periodicita)
  @IsOptional()
  periodicita?: Periodicita;

  @IsOptional()
  @Type(() => Number)
  importoPrevisto?: number;

  @IsEnum(StatoScadenza)
  @IsOptional()
  stato?: StatoScadenza;
}
