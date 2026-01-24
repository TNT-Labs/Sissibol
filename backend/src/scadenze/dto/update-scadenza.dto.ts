import { PartialType } from '@nestjs/mapped-types';
import { CreateScadenzaDto } from './create-scadenza.dto';

export class UpdateScadenzaDto extends PartialType(CreateScadenzaDto) {}
