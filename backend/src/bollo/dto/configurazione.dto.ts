import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateConfigurazioneDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsNotEmpty()
  @Type(() => Number)
  annoValidita: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  regione: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  scontoRid?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}

export class UpdateConfigurazioneDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  scontoRid?: number;

  @IsBoolean()
  @IsOptional()
  attivo?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}

export class DuplicaConfigurazioneDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsNotEmpty()
  @Type(() => Number)
  nuovoAnno: number;
}
