import { IsNotEmpty, IsInt, IsDateString, IsDecimal, IsEnum, IsOptional } from 'class-validator';
import { StatoScadenza } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateScadenzaDto {
  @IsInt()
  @IsNotEmpty()
  idVeicolo: number;

  @IsDateString()
  @IsNotEmpty()
  dataScadenza: string;

  @IsOptional()
  @Type(() => Number)
  importoPrevisto?: number;

  @IsEnum(StatoScadenza)
  @IsOptional()
  stato?: StatoScadenza;
}
