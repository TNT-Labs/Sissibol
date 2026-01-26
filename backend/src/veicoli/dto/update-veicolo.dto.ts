import { PartialType } from '../../common/partial-type';
import { CreateVeicoloDto } from './create-veicolo.dto';

export class UpdateVeicoloDto extends PartialType(CreateVeicoloDto) {}
