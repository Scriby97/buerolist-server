import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAbsenceReasonDto {
  @IsUUID()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class UpdateAbsenceReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
