import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type AbsencePortion = 'full' | 'half' | 'hours';

export class CreateAbsenceDto {
  @IsUUID()
  organizationId: string;

  @IsUUID()
  reasonId: string;

  /** Erster Tag "YYYY-MM-DD" */
  @Matches(DATE_KEY)
  from: string;

  /** Letzter Tag (inkl.), fehlt = nur `from`. Wochenenden werden uebersprungen. */
  @IsOptional()
  @Matches(DATE_KEY)
  to?: string;

  /** Ganzer Tag (persoenlicher Arbeitstag), halber Tag oder `minutes` */
  @IsIn(['full', 'half', 'hours'])
  portion: AbsencePortion;

  @ValidateIf((dto: CreateAbsenceDto) => dto.portion === 'hours')
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  /** Admin/Owner: fuer eine andere Person erfassen */
  @IsOptional()
  @IsUUID()
  creatorId?: string;

  /** Admin/Owner: fuer mehrere Personen auf einmal erfassen */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  creatorIds?: string[];
}

export class UpdateAbsenceDto {
  @IsOptional()
  @IsUUID()
  reasonId?: string;

  @IsOptional()
  @Matches(DATE_KEY)
  date?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string | null;
}
