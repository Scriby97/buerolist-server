import { IsDateString, IsOptional, IsUUID } from 'class-validator';

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
}
