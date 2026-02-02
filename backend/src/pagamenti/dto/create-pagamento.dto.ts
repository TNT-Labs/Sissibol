import { IsNotEmpty, IsInt, IsDateString, IsOptional, IsString, IsNumber, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePagamentoDto {
  @IsInt()
  @IsNotEmpty()
  idScadenza: number;

  @IsDateString()
  @IsNotEmpty()
  dataPagamento: string;

  // BUG FIX: @Min(0) permetteva importi di 0€ (non ha senso per un pagamento)
  // Aggiunto @Max per evitare importi astronomici (possibile overflow/frode)
  @IsNumber()
  @Min(0.01, { message: 'L\'importo deve essere maggiore di 0' })
  @Max(999999.99, { message: 'L\'importo non può superare 999.999,99€' })
  @Type(() => Number)
  importoPagato: number;

  // BUG FIX: aggiunto MaxLength per evitare stringhe enormi (DoS potential)
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Il metodo di pagamento non può superare 100 caratteri' })
  metodoPagamento?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'Il path del file non può superare 500 caratteri' })
  ricevutaFile?: string;
}
