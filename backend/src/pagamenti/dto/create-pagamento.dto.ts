import { IsNotEmpty, IsInt, IsDateString, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePagamentoDto {
  @IsInt()
  @IsNotEmpty()
  idScadenza: number;

  @IsDateString()
  @IsNotEmpty()
  dataPagamento: string;

  @IsNotEmpty()
  @Type(() => Number)
  importoPagato: number;

  @IsString()
  @IsOptional()
  metodoPagamento?: string;

  @IsString()
  @IsOptional()
  ricevutaFile?: string;
}
