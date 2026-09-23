import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Selfservice-Bearbeitung der eigenen Organisation durch den Owner
 * (aktuell nur der Name; das Logo laeuft ueber eigene Upload-/Delete-Endpoints).
 */
export class UpdateOrganizationProfileDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;
}
