import { PartialType } from '../../common/partial-type';
import { CreatePagamentoDto } from './create-pagamento.dto';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdatePagamentoDto extends PartialType(CreatePagamentoDto) {
  /**
   * Versione corrente del pagamento per optimistic locking.
   * Obbligatorio per evitare race condition in ambienti multi-utente.
   */
  @IsOptional()
  @IsInt({ message: 'La versione deve essere un numero intero' })
  @Min(0, { message: 'La versione deve essere >= 0' })
  version?: number;
}
