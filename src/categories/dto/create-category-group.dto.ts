import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateCategoryGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  // Nur fuer globale Administratoren Pflicht, siehe CreateCategoryDto.
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
