import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationRolesGuard } from './organization-roles.guard';
import { OrganizationRole, UserRole } from '../enums/user-role.enum';
import { AppForbiddenException } from '../../common/exceptions';

describe('OrganizationRolesGuard', () => {
  let guard: OrganizationRolesGuard;
  let reflector: { get: jest.Mock };

  const makeContext = (
    membership: { role: OrganizationRole } | undefined,
    userRole: UserRole = UserRole.USER,
  ) =>
    ({
      getHandler: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'user-1', role: userRole },
          organizationMembership: membership,
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { get: jest.fn() };
    guard = new OrganizationRolesGuard(reflector as unknown as Reflector);
  });

  it('allows the request when the handler has no @OrganizationRoles decorator', () => {
    reflector.get.mockReturnValue(undefined);

    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('throws when there is no organization membership on the request', () => {
    reflector.get.mockReturnValue([OrganizationRole.ADMIN]);

    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      AppForbiddenException,
    );
  });

  it('rejects an employee when ADMIN is required', () => {
    reflector.get.mockReturnValue([OrganizationRole.ADMIN]);

    expect(() =>
      guard.canActivate(makeContext({ role: OrganizationRole.EMPLOYEE })),
    ).toThrow(AppForbiddenException);
  });

  it('allows an admin when ADMIN is required', () => {
    reflector.get.mockReturnValue([OrganizationRole.ADMIN]);

    expect(
      guard.canActivate(makeContext({ role: OrganizationRole.ADMIN })),
    ).toBe(true);
  });

  it('allows an owner when only ADMIN is required (higher role satisfies a lower requirement)', () => {
    reflector.get.mockReturnValue([OrganizationRole.ADMIN]);

    expect(
      guard.canActivate(makeContext({ role: OrganizationRole.OWNER })),
    ).toBe(true);
  });

  it('rejects an admin when OWNER is required', () => {
    reflector.get.mockReturnValue([OrganizationRole.OWNER]);

    expect(() =>
      guard.canActivate(makeContext({ role: OrganizationRole.ADMIN })),
    ).toThrow(AppForbiddenException);
  });

  it('allows a global administrator even without an organization membership on the request', () => {
    // OrganizationGuard bewusst KEIN organizationMembership fuer globale
    // Administratoren setzt (siehe organization.guard.ts) - ohne diesen
    // Bypass hier wuerden sie faelschlich als "keine Mitgliedschaft"
    // abgelehnt, obwohl OrganizationGuard sie bereits durchgelassen hat.
    reflector.get.mockReturnValue([OrganizationRole.OWNER]);

    expect(
      guard.canActivate(makeContext(undefined, UserRole.ADMINISTRATOR)),
    ).toBe(true);
  });

  it('allows an employee when EMPLOYEE is the required role', () => {
    reflector.get.mockReturnValue([OrganizationRole.EMPLOYEE]);

    expect(
      guard.canActivate(makeContext({ role: OrganizationRole.EMPLOYEE })),
    ).toBe(true);
  });
});
