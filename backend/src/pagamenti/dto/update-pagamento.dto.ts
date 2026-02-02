import { IsInt, IsDateString, IsOptional, IsString, IsNumber, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePagamentoDto {
  @IsInt()
  @IsOptional()
  idScadenza?: number;

  @IsDateString()
  @IsOptional()
  dataPagamento?: string;

  // BUG FIX: mancava completamente la validazione su importoPagato
  // Poteva essere negativo o qualsiasi valore!
  @IsOptional()
  @IsNumber({}, { message: 'L\'importo deve essere un numero' })
  @Min(0.01, { message: 'L\'importo deve essere maggiore di 0' })
  @Max(999999.99, { message: 'L\'importo non può superare 999.999,99€' })
  @Type(() => Number)
  importoPagato?: number;

  // BUG FIX: aggiunto MaxLength per evitare stringhe enormi
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Il metodo di pagamento non può superare 100 caratteri' })
  metodoPagamento?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'Il path del file non può superare 500 caratteri' })
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
