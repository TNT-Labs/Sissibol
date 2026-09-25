import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsInt, IsString, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { ALIMENTAZIONI, CLASSI_AMBIENTALI, REGIONI, TIPI_SOSPENSIONE, TIPI_VEICOLO } from '../../veicoli/domini';

/**
 * Campi impostabili su più veicoli insieme: solo quelli a dominio chiuso.
 * Potenza, peso e simili sono propri di ciascun mezzo e vanno letti sulla
 * sua carta di circolazione.
 */
export const DOMINI_MULTIPLI: Record<string, readonly string[]> = {
  // Motrice e Altro esistono solo per i dati importati: non si assegnano.
  tipoVeicolo: TIPI_VEICOLO.filter((t) => t !== 'Motrice' && t !== 'Altro'),
  classeAmbientale: CLASSI_AMBIENTALI,
  alimentazione: ALIMENTAZIONI,
  regione: REGIONI,
  tipoSospensione: TIPI_SOSPENSIONE,
};

@ValidatorConstraint({ name: 'valorePerCampo' })
class ValorePerCampo implements ValidatorConstraintInterface {
  validate(valore: unknown, args: ValidationArguments) {
    const dominio = DOMINI_MULTIPLI[(args.object as ImpostaCampoDto).campo];
    return typeof valore === 'string' && !!dominio && dominio.includes(valore);
  }
  defaultMessage(args: ValidationArguments) {
    const campo = (args.object as ImpostaCampoDto).campo;
    const dominio = DOMINI_MULTIPLI[campo];
    return dominio
      ? `valore "${args.value}" non ammesso per ${campo}. Valori validi: ${dominio.join(', ')}`
      : 'campo non valido';
  }
}

export class ImpostaCampoDto {
  @IsArray()
  @ArrayNotEmpty()
  // Una pagina di lavoro: ogni veicolo ricalcola i propri importi.
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  idVeicoli: number[];

  @IsIn(Object.keys(DOMINI_MULTIPLI))
  campo: string;

  @IsString()
  @Validate(ValorePerCampo)
  valore: string;
}
