import { PartialType } from '../../common/partial-type';
import { CreateScadenzaDto } from './create-scadenza.dto';

export class UpdateScadenzaDto extends PartialType(CreateScadenzaDto) {}
