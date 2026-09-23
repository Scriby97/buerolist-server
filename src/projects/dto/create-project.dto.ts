import {
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateProjectDto {
  @IsUUID()
  customerId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  // Teilmenge der Kategorien-Bibliothek der Organisation, die für dieses
  // Projekt gelten sollen - siehe ProjectCategoryEntity.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  // Nur für globale Administratoren Pflicht, siehe CreateCategoryDto.
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
