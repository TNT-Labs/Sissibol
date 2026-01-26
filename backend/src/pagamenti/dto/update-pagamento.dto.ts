import { PartialType } from '../../common/partial-type';
import { CreatePagamentoDto } from './create-pagamento.dto';

export class UpdatePagamentoDto extends PartialType(CreatePagamentoDto) {}
