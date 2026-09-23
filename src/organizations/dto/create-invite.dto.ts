import { IsEmail, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OrganizationRole } from '../../auth/enums/user-role.enum';

export class CreateInviteDto {
  @IsEmail()
  email: string;

  @IsUUID()
  @IsOptional()
  organizationId?: string; // Optional für ADMINISTRATOR beim Invite für andere Orgs

  @IsEnum(OrganizationRole)
  @IsOptional()
  role?: OrganizationRole; // Default: employee
}
