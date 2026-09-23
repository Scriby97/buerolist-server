import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../enums/user-role.enum';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const makeContext = (user: { role: UserRole } | undefined) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows the request when no roles are required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('denies the request when roles are required but there is no user', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMINISTRATOR]);

    expect(guard.canActivate(makeContext(undefined))).toBe(false);
  });

  it('allows a user whose role matches one of the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMINISTRATOR]);

    expect(
      guard.canActivate(makeContext({ role: UserRole.ADMINISTRATOR })),
    ).toBe(true);
  });

  it("denies a user whose role doesn't match any required role", () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMINISTRATOR]);

    expect(guard.canActivate(makeContext({ role: UserRole.USER }))).toBe(false);
  });
});
