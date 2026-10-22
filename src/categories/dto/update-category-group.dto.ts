import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateCategoryGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}
