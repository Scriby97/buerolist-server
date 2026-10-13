import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const TIME_ENTRY_COMMENT_MAX_LENGTH = 1000;

export class CreateTimeEntryDto {
  @IsUUID()
  projectId: string;

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
}
