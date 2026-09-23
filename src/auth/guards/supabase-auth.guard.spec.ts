import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify } from 'jose';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { UserRole } from '../enums/user-role.enum';
import { AppUnauthorizedException } from '../../common/exceptions';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => ({})),
  jwtVerify: jest.fn(),
}));

describe('SupabaseAuthGuard', () => {
  let guard: SupabaseAuthGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  const profileRepo = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(),
    update: jest.fn(),
  };
  const mockedJwtVerify = jwtVerify as jest.Mock;

  const makeContext = (request: any) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  beforeAll(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    guard = new SupabaseAuthGuard(
      reflector as unknown as Reflector,
      profileRepo as any,
    );
  });

  it('skips authentication for public routes', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = makeContext({ headers: {} });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockedJwtVerify).not.toHaveBeenCalled();
  });

  it('rejects a request with no Authorization header', async () => {
    const context = makeContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toThrow(
      AppUnauthorizedException,
    );
  });

  it('rejects a request with a malformed Authorization header', async () => {
    const context = makeContext({
      headers: { authorization: 'Basic abc123' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      AppUnauthorizedException,
    );
  });

  it('rejects when the token fails JWT verification', async () => {
    mockedJwtVerify.mockRejectedValue(
      new Error('signature verification failed'),
    );
    const context = makeContext({
      headers: { authorization: 'Bearer bad-token' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      AppUnauthorizedException,
    );
  });

  it('rejects a token with no subject (sub) claim', async () => {
    mockedJwtVerify.mockResolvedValue({ payload: { email: 'a@b.com' } });
    const context = makeContext({
      headers: { authorization: 'Bearer token' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      AppUnauthorizedException,
    );
  });

  it('attaches the user to the request when the profile already exists (DB role wins over metadata)', async () => {
    mockedJwtVerify.mockResolvedValue({
      payload: {
        sub: 'user-1',
        email: 'user@example.com',
        user_metadata: { role: 'administrator', firstName: 'Ada' },
      },
    });
    profileRepo.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: UserRole.USER,
    });
    const request: any = { headers: { authorization: 'Bearer token' } };
    const context = makeContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      id: 'user-1',
      email: 'user@example.com',
      role: UserRole.USER,
    });
    expect(profileRepo.save).not.toHaveBeenCalled();
  });

  it('creates a new profile on first login when none exists yet', async () => {
    mockedJwtVerify.mockResolvedValue({
      payload: { sub: 'new-user', email: 'new@example.com', user_metadata: {} },
    });
    profileRepo.findOne.mockResolvedValue(null);
    const request: any = { headers: { authorization: 'Bearer token' } };
    const context = makeContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(profileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-user', role: UserRole.USER }),
    );
    expect(request.user.role).toBe(UserRole.USER);
  });

  it('repairs an orphaned profile (same email, different id) instead of creating a duplicate', async () => {
    mockedJwtVerify.mockResolvedValue({
      payload: {
        sub: 'new-auth-id',
        email: 'user@example.com',
        user_metadata: {},
      },
    });
    // First lookup by the new auth id finds nothing, then lookup by email finds the orphan.
    profileRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'old-id',
        email: 'user@example.com',
        role: UserRole.USER,
      })
      .mockResolvedValueOnce({
        id: 'new-auth-id',
        email: 'user@example.com',
        role: UserRole.USER,
      });
    const request: any = { headers: { authorization: 'Bearer token' } };
    const context = makeContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(profileRepo.update).toHaveBeenCalledWith(
      { id: 'old-id' },
      { id: 'new-auth-id' },
    );
    expect(profileRepo.create).not.toHaveBeenCalled();
  });
});
