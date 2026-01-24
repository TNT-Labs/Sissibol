import { PartialType } from '@nestjs/mapped-types';
import { CreateVeicoloDto } from './create-veicolo.dto';

export class UpdateVeicoloDto extends PartialType(CreateVeicoloDto) {}
