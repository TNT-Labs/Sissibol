import { IsNotEmpty, IsString, IsInt, IsOptional } from 'class-validator';

export class CreateVeicoloDto {
  @IsInt()
  @IsNotEmpty()
  idCliente: number;

  @IsString()
  @IsNotEmpty()
  targa: string;

  @IsString()
  @IsOptional()
  tipoVeicolo?: string;

  @IsString()
  @IsOptional()
  classeAmbientale?: string;

  @IsString()
  @IsOptional()
  regione?: string;

  @IsString()
  @IsOptional()
  note?: string;
}
