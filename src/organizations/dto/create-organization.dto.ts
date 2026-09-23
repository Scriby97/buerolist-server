import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  IsEnum,
} from 'class-validator';
import { OrganizationRole } from '../../auth/enums/user-role.enum';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @IsOptional()
  subdomain?: string;

  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  // Neues Feld: Admin Email für Invite
  @IsEmail()
  adminEmail: string;

  @IsString()
  @IsOptional()
  adminFirstName?: string;

  @IsString()
  @IsOptional()
  adminLastName?: string;

  @IsEnum(OrganizationRole)
  @IsOptional()
  adminRole?: OrganizationRole; // Default: admin (OrganizationRole.ADMIN)
}
