import {
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

export const TIME_ENTRY_COMMENT_MAX_LENGTH = 1000;

export class CreateTimeEntryDto {
  @IsUUID()
  projectId: string;

  // Fuer wen erfasst wird (nur Admin/Owner; fehlt = fuer sich selbst)
  @IsOptional()
  @IsUUID()
  creatorId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsDateString()
  startAt: string;

  @IsDateString()
  endAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(TIME_ENTRY_COMMENT_MAX_LENGTH)
  comment?: string;

  // Material/Spesen. Beim Bearbeiten ersetzt eine mitgeschickte Liste alle
  // bisherigen Positionen; weglassen laesst sie unveraendert.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TIME_ENTRY_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => TimeEntryItemDto)
  items?: TimeEntryItemDto[];
}
