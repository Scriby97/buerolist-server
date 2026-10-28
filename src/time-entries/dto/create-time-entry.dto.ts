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

export const TIME_ENTRY_COMMENT_MAX_LENGTH = 1000;
export const TIME_ENTRY_MAX_CREATORS = 50;

export class CreateTimeEntryDto {
  @IsUUID()
  projectId: string;

  // Fuer wen erfasst wird (nur Admin/Owner; fehlt = fuer sich selbst)
  @IsOptional()
  @IsUUID()
  creatorId?: string;

  // Gleichen Eintrag fuer mehrere Mitarbeiter anlegen (ersetzt creatorId).
  // Alles oder nichts: ueberschneidet er sich bei einer Person, wird keiner
  // gespeichert.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TIME_ENTRY_MAX_CREATORS)
  @IsUUID('all', { each: true })
  creatorIds?: string[];

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsDateString()
  startAt: string;

  @IsDateString()
  endAt: string;

  // Fahrzeit in Minuten (0-1440); null entfernt sie, weglassen laesst sie unveraendert.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  travelMinutes?: number | null;

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
