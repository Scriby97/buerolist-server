import { SetMetadata } from '@nestjs/common';
import { OrganizationRole } from '../enums/user-role.enum';

/**
 * Decorator to specify required organization roles for an endpoint
 * Must be used with OrganizationRolesGuard
 *
 * @example
 * @OrganizationRoles(OrganizationRole.ADMIN)
 * updateProject() { ... }
 */
export const OrganizationRoles = (...roles: OrganizationRole[]) =>
  SetMetadata('organizationRoles', roles);
