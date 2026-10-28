import {
  IsInt,
  Max,
  Min,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ArrayMaxSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TIME_ENTRY_MAX_ITEMS, TimeEntryItemDto } from './time-entry-item.dto';
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

  // Fahrzeit in Minuten (0-1440); null entfernt sie, weglassen laesst sie unveraendert.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  travelMinutes?: number | null;

  // null oder '' entfernt die Bemerkung, weglassen laesst sie unveraendert.
  @IsOptional()
  @IsString()
  @MaxLength(TIME_ENTRY_COMMENT_MAX_LENGTH)
  comment?: string | null;

  // Material/Spesen. Beim Bearbeiten ersetzt eine mitgeschickte Liste alle
  // bisherigen Positionen; weglassen laesst sie unveraendert.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TIME_ENTRY_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => TimeEntryItemDto)
  items?: TimeEntryItemDto[];
}
