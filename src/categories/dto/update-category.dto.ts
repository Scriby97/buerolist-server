import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  // In eine andere Hauptkategorie verschieben (bekommt dort die naechste Nummer).
  @IsOptional()
  @IsUUID()
  groupId?: string;
}
