import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePlaceholderMemberDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  lastName: string;
}
