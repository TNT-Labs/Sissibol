import { IsNotEmpty, IsInt, IsDateString, IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePagamentoDto {
  @IsInt()
  @IsNotEmpty()
  idScadenza: number;

  @IsDateString()
  @IsNotEmpty()
  dataPagamento: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  importoPagato: number;

  @IsString()
  @IsOptional()
  metodoPagamento?: string;

  @IsString()
  @IsOptional()
  ricevutaFile?: string;
}
