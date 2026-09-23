import { IsEnum } from 'class-validator';
import { OrganizationRole } from '../../auth/enums/user-role.enum';

export class UpdateMemberRoleDto {
  @IsEnum(OrganizationRole)
  role: OrganizationRole;
}
