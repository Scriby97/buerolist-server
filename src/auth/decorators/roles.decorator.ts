import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';

export const ROLES_KEY = 'roles';

/**
 * Decorator um erforderliche Rollen für einen Endpoint zu definieren
 * Verwendung: @Roles(UserRole.ADMINISTRATOR) oder @Roles(UserRole.USER)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
