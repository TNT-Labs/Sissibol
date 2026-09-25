import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Min } from 'class-validator';

export const FORMATI = ['xlsx', 'pdf'] as const;
export type Formato = (typeof FORMATI)[number];

const MESE = /^\d{4}-(0[1-9]|1[0-2])$/;
const GIORNO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

class ConFormato {
  @IsIn(FORMATI, { message: 'formato deve essere xlsx o pdf' })
  formato!: Formato;
}

export class QueryReportScadenze extends ConFormato {
  @IsOptional()
  @IsIn(['DA_PAGARE', 'PAGATO', 'SCADUTO'])
  stato?: 'DA_PAGARE' | 'PAGATO' | 'SCADUTO';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCliente?: number;

  /** Primo mese incluso, AAAA-MM (predefinito: gennaio dell'anno in corso). */
  @IsOptional()
  @Matches(MESE, { message: 'da deve essere nel formato AAAA-MM' })
  da?: string;

  /** Ultimo mese incluso, AAAA-MM (predefinito: dicembre dell'anno in corso). */
  @IsOptional()
  @Matches(MESE, { message: 'a deve essere nel formato AAAA-MM' })
  a?: string;
}

export class QueryReportPagamenti extends ConFormato {
  @IsOptional()
  @Matches(GIORNO, { message: 'dal deve essere nel formato AAAA-MM-GG' })
  dal?: string;

  @IsOptional()
  @Matches(GIORNO, { message: 'al deve essere nel formato AAAA-MM-GG' })
  al?: string;
}

export class QueryReportClienti extends ConFormato {}
