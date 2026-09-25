import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class RimettiInCodaDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @IsInt({ each: true })
  ids: number[];
}
