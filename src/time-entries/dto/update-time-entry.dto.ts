import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { TIME_ENTRY_COMMENT_MAX_LENGTH } from './create-time-entry.dto';

export class UpdateTimeEntryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  // null oder '' entfernt die Bemerkung, weglassen laesst sie unveraendert.
  @IsOptional()
  @IsString()
  @MaxLength(TIME_ENTRY_COMMENT_MAX_LENGTH)
  comment?: string | null;
}
