import { IsNotEmpty, IsString, IsInt, IsOptional, IsNumber, IsDateString, IsIn, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { ALIMENTAZIONI, CLASSI_AMBIENTALI, REGIONI, TIPI_SOSPENSIONE, TIPI_VEICOLO } from '../domini';

const ammessi = (valori: readonly string[]) => ({
  message: `$property: valore "$value" non ammesso. Valori validi: ${valori.join(', ')}`,
});

export class CreateVeicoloDto {
  @IsInt()
  @IsNotEmpty()
  idCliente: number;

  @IsString()
  @IsNotEmpty()
  targa: string;

  @IsIn(TIPI_VEICOLO, ammessi(TIPI_VEICOLO))
  @IsOptional()
  tipoVeicolo?: string;

  @IsIn(CLASSI_AMBIENTALI, ammessi(CLASSI_AMBIENTALI))
  @IsOptional()
  classeAmbientale?: string;

  @IsIn(REGIONI, ammessi(REGIONI))
  @IsOptional()
  regione?: string;

  // Nuovi campi per calcolo bollo (tariffario Lombardia 2026)
  @IsIn(ALIMENTAZIONI, ammessi(ALIMENTAZIONI))
  @IsOptional()
  alimentazione?: string;

  @IsNumber()
  @IsPositive({ message: '$property deve essere maggiore di zero: se il dato non è noto, lasciare vuoto' })
  @IsOptional()
  @Type(() => Number)
  potenzaKw?: number;

  @IsInt()
  @IsPositive({ message: '$property deve essere maggiore di zero: se il dato non è noto, lasciare vuoto' })
  @IsOptional()
  @Type(() => Number)
  cilindrata?: number;

  @IsInt()
  @IsPositive({ message: '$property deve essere maggiore di zero: se il dato non è noto, lasciare vuoto' })
  @IsOptional()
  @Type(() => Number)
  portataKg?: number;

  @IsInt()
  @IsPositive({ message: '$property deve essere maggiore di zero: se il dato non è noto, lasciare vuoto' })
  @IsOptional()
  @Type(() => Number)
  pesoComplessivoKg?: number;

  @IsInt()
  @IsPositive({ message: '$property deve essere maggiore di zero: se il dato non è noto, lasciare vuoto' })
  @IsOptional()
  @Type(() => Number)
  numeroAssi?: number;

  @IsIn(TIPI_SOSPENSIONE, ammessi(TIPI_SOSPENSIONE))
  @IsOptional()
  tipoSospensione?: string;

  @IsInt()
  @IsPositive({ message: '$property deve essere maggiore di zero: se il dato non è noto, lasciare vuoto' })
  @IsOptional()
  @Type(() => Number)
  numeroPosti?: number;

  @IsInt()
  @IsPositive({ message: '$property deve essere maggiore di zero: se il dato non è noto, lasciare vuoto' })
  @IsOptional()
  @Type(() => Number)
  massaRimorchiabileKg?: number;

  @IsDateString()
  @IsOptional()
  dataImmatricolazione?: string;

  @IsString()
  @IsOptional()
  note?: string;
}
