import { IsDateString, IsOptional, IsUUID } from 'class-validator';

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
}
