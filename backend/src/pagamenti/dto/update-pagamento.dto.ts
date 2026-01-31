import { IsInt, IsDateString, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePagamentoDto {
  @IsInt()
  @IsOptional()
  idScadenza?: number;

  @IsDateString()
  @IsOptional()
  dataPagamento?: string;

  @IsOptional()
  @Type(() => Number)
  importoPagato?: number;

  @IsString()
  @IsOptional()
  metodoPagamento?: string;

  @IsString()
  @IsOptional()
  ricevutaFile?: string;

  /**
   * Versione corrente del pagamento per optimistic locking.
   * Obbligatorio per evitare race condition in ambienti multi-utente.
   */
  @IsOptional()
  @IsInt({ message: 'La versione deve essere un numero intero' })
  @Min(0, { message: 'La versione deve essere >= 0' })
  version?: number;
}
