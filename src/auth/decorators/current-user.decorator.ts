import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';
import type { OrganizationMemberEntity } from '../../organizations/organization-member.entity';

export interface AuthUser {
  id: string;
  email?: string;
  role: UserRole;
  [key: string]: any;
}

/**
 * Request-Shape, wie er nach SupabaseAuthGuard (und ggf. OrganizationGuard)
 * aussieht - vermeidet `any`-Zugriffe auf request.user/organizationMembership
 * in Guards und Decorators.
 *
 * Bewusst nicht `extends Request` aus 'express': unter `moduleResolution:
 * nodenext` + Express 5 löst sich der Express-`Request`-Typ auf Linux anders
 * auf als auf Windows und verliert dabei params/headers/body (siehe Render-
 * Build-Fehler TS2339) - hier reicht die kleine Teilmenge, die tatsächlich
 * verwendet wird.
 */
export interface AuthenticatedRequest {
  params: Record<string, string>;
  headers: { authorization?: string } & Record<
    string,
    string | string[] | undefined
  >;
  body?: unknown;
  user?: AuthUser;
  organizationMembership?: OrganizationMemberEntity;
}

/**
 * Decorator um den aktuellen authentifizierten User zu holen
 * Verwendet in Controllern: @CurrentUser() user: AuthUser
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user!;
  },
);
